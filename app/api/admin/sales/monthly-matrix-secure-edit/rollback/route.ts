/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/rollback
 * Reverses all cell writes for a save batch (audit-driven).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { prisma } from '@/lib/db';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { assertAdminMatrixSecureEditRole, logMatrixSecureActivity } from '@/lib/matrixSecureEdit/session';
import { dateKeyToUTCNoon } from '@/lib/matrixSecureEdit/dateKeyToDate';
import { finalizeMatrixVersionInTx, MatrixVersionConflictError } from '@/lib/matrixSecureEdit/versioning';
import { REASON_MIN_LEN } from '@/lib/matrixSecureEdit/constants';
import type { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

class RollbackStaleError extends Error {
  constructor(
    public readonly dateKey: string,
    public readonly userId: string,
    public readonly expected: number,
    public readonly actual: number
  ) {
    super('ROLLBACK_STALE');
    this.name = 'RollbackStaleError';
  }
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(ADMIN_ROLES);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!assertAdminMatrixSecureEditRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;
  const boutiqueId = scope.boutiqueId;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const saveBatchId =
    typeof body.saveBatchId === 'string'
      ? body.saveBatchId.trim()
      : typeof body.auditSessionId === 'string'
        ? body.auditSessionId.trim()
        : '';
  const month = typeof body.month === 'string' ? normalizeMonthKey(body.month.trim()) : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const clientMatrixVersion = Number(body.matrixVersion);

  if (!saveBatchId) {
    return NextResponse.json({ error: 'saveBatchId (or auditSessionId) required' }, { status: 400 });
  }
  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (reason.length < REASON_MIN_LEN) {
    return NextResponse.json(
      { error: `reason must be at least ${REASON_MIN_LEN} characters` },
      { status: 400 }
    );
  }
  if (!Number.isInteger(clientMatrixVersion) || clientMatrixVersion < 0) {
    return NextResponse.json({ error: 'matrixVersion must be a non-negative integer' }, { status: 400 });
  }

  const audits = await prisma.salesMatrixEditCellAudit.findMany({
    where: {
      saveBatchId,
      boutiqueId,
      month,
      rolledBackAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (audits.length === 0) {
    return NextResponse.json({ error: 'No active edits found for this batch.' }, { status: 404 });
  }

  const versionRow = await prisma.salesMatrixEditVersion.findUnique({
    where: { boutiqueId_month: { boutiqueId, month } },
    select: { version: true },
  });
  const actualVersion = versionRow?.version ?? 0;
  if (actualVersion !== clientMatrixVersion) {
    return NextResponse.json(
      {
        error: 'Matrix version mismatch. Refresh and retry.',
        code: 'MATRIX_VERSION_CONFLICT',
        matrixVersion: actualVersion,
      },
      { status: 409 }
    );
  }

  await logMatrixSecureActivity({
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'ROLLBACK_ATTEMPT',
    meta: { saveBatchId, cellCount: audits.length },
  });

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const a of audits) {
        const row = await tx.salesEntry.findFirst({
          where: {
            boutiqueId,
            dateKey: a.dateKey,
            userId: a.targetUserId,
          },
          select: { amount: true },
        });
        const current = row?.amount ?? 0;
        if (current !== a.newAmount) {
          throw new RollbackStaleError(a.dateKey, a.targetUserId, a.newAmount, current);
        }

        let dateNorm: Date;
        try {
          dateNorm = dateKeyToUTCNoon(a.dateKey);
        } catch {
          throw new Error(`bad_date:${a.dateKey}`);
        }

        const res = await upsertCanonicalSalesEntry({
          kind: 'direct',
          boutiqueId,
          userId: a.targetUserId,
          amount: a.oldAmount,
          source: SALES_ENTRY_SOURCE.MATRIX_MANUAL_EDIT,
          actorUserId: user.id,
          date: dateNorm,
          respectLedgerLock: false,
          allowLockedOverride: true,
          forceAdminOverride: true,
          tx,
        });

        if (
          res.status === 'rejected_locked' ||
          res.status === 'rejected_precedence' ||
          res.status === 'rejected_invalid'
        ) {
          throw new Error(`rollback_rejected:${a.dateKey}:${a.targetUserId}`);
        }

        await tx.salesMatrixEditCellAudit.update({
          where: { id: a.id },
          data: { rolledBackAt: new Date() },
        });
      }

      await finalizeMatrixVersionInTx(tx, boutiqueId, month, clientMatrixVersion);
    });
  } catch (e) {
    if (e instanceof MatrixVersionConflictError) {
      return NextResponse.json(
        {
          error: 'Concurrent update detected. Refresh and retry.',
          code: 'MATRIX_VERSION_CONFLICT',
          matrixVersion: e.currentVersion,
        },
        { status: 409 }
      );
    }
    if (e instanceof RollbackStaleError) {
      return NextResponse.json(
        {
          error: 'Data changed since this save; cannot rollback safely.',
          detail: {
            dateKey: e.dateKey,
            userId: e.userId,
            expectedPostSaveAmount: e.expected,
            actual: e.actual,
          },
        },
        { status: 409 }
      );
    }
    const msg = e instanceof Error ? e.message : 'rollback_failed';
    await logMatrixSecureActivity({
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'ROLLBACK_FAILURE',
      detail: msg,
      meta: { saveBatchId },
    });
    return NextResponse.json({ error: 'Rollback failed', detail: msg }, { status: 500 });
  }

  const newV = await prisma.salesMatrixEditVersion.findUnique({
    where: { boutiqueId_month: { boutiqueId, month } },
    select: { version: true },
  });

  await logMatrixSecureActivity({
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'ROLLBACK_SUCCESS',
    meta: { saveBatchId, cells: audits.length, matrixVersion: newV?.version },
  });

  return NextResponse.json({
    ok: true,
    rolledBackCells: audits.length,
    saveBatchId,
    matrixVersion: newV?.version ?? clientMatrixVersion + 1,
  });
}
