/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/save
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { prisma } from '@/lib/db';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import {
  assertAdminMatrixSecureEditRole,
  getValidUnlockSession,
  logMatrixSecureActivity,
  revokeUnlockSession,
} from '@/lib/matrixSecureEdit/session';
import { dateKeyToUTCNoon } from '@/lib/matrixSecureEdit/dateKeyToDate';
import {
  MATRIX_SECURE_EDIT_PAGE,
  REASON_MIN_LEN,
} from '@/lib/matrixSecureEdit/constants';
import {
  parseChangedCells,
  validateClientDeltaClaim,
  validateGrandTotalAfterClaim,
  analyzeSuspiciousPatterns,
  assessHighRiskSave,
  assertHighRiskGate,
} from '@/lib/matrixSecureEdit/saveValidation';
import { loadAllowedUserIdsForMatrixMonth, monthDayKeys } from '@/lib/matrixSecureEdit/saveContext';
import { getMonthlyMatrixPayload } from '@/lib/sales/monthlyMatrixPayload';
import { finalizeMatrixVersionInTx, MatrixVersionConflictError } from '@/lib/matrixSecureEdit/versioning';
import type { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

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

  const month = typeof body.month === 'string' ? normalizeMonthKey(body.month.trim()) : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const unlockSessionId =
    typeof body.unlockSessionId === 'string' ? body.unlockSessionId.trim() : '';
  const autoLock = body.autoLock === true;
  const changedCellsRaw = body.changedCells;
  const clientMatrixVersion = Number(body.matrixVersion);
  const confirmForceSave = body.confirmForceSave === true;
  const forceSave = body.forceSave === true;

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (reason.length < REASON_MIN_LEN) {
    return NextResponse.json(
      { error: `reason must be at least ${REASON_MIN_LEN} characters` },
      { status: 400 }
    );
  }
  if (!unlockSessionId) {
    return NextResponse.json({ error: 'unlockSessionId required' }, { status: 400 });
  }
  if (!Number.isInteger(clientMatrixVersion) || clientMatrixVersion < 0) {
    return NextResponse.json({ error: 'matrixVersion must be a non-negative integer' }, { status: 400 });
  }

  const session = await getValidUnlockSession(unlockSessionId, user.id, boutiqueId, month);
  if (!session) {
    await logMatrixSecureActivity({
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'SAVE_FAILURE',
      detail: 'unlock_expired_or_invalid',
    });
    return NextResponse.json({ error: 'Unlock session expired or invalid. Unlock again.' }, { status: 403 });
  }

  const serverMatrixVersionPre = await prisma.salesMatrixEditVersion.findUnique({
    where: { boutiqueId_month: { boutiqueId, month } },
    select: { version: true },
  });
  const actualVersionPre = serverMatrixVersionPre?.version ?? 0;
  if (actualVersionPre !== clientMatrixVersion) {
    await logMatrixSecureActivity({
      unlockSessionId,
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'SAVE_FAILURE',
      detail: 'matrix_version_conflict',
      meta: { expected: clientMatrixVersion, actual: actualVersionPre },
    });
    return NextResponse.json(
      {
        error: 'Matrix was updated by another session. Refresh and retry.',
        code: 'MATRIX_VERSION_CONFLICT',
        matrixVersion: actualVersionPre,
      },
      { status: 409 }
    );
  }

  const allowedDays = monthDayKeys(month);
  const allowedUserIds = await loadAllowedUserIdsForMatrixMonth(boutiqueId, month);

  const parsed = parseChangedCells(changedCellsRaw, allowedDays, allowedUserIds);
  if (!parsed.ok) {
    const e = parsed.error;
    return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
  }
  const changedCells = parsed.cells;

  const deltaClaim = validateClientDeltaClaim(changedCells, body.clientTotalDelta);
  if (!deltaClaim.ok) {
    return NextResponse.json({ error: deltaClaim.error.message, code: deltaClaim.error.code }, { status: 400 });
  }

  const grandAgg = await prisma.salesEntry.aggregate({
    where: { boutiqueId, month },
    _sum: { amount: true },
  });
  const grandBefore = grandAgg._sum.amount ?? 0;

  const grandClaim = validateGrandTotalAfterClaim(grandBefore, changedCells, body.clientExpectedGrandTotalAfter);
  if (!grandClaim.ok) {
    return NextResponse.json(
      { error: grandClaim.error.message, code: grandClaim.error.code },
      { status: 400 }
    );
  }

  const suspicious = analyzeSuspiciousPatterns(changedCells);
  let absDeltaSum = 0;
  for (const c of changedCells) absDeltaSum += Math.abs(c.newAmount - c.oldAmount);

  const highRisk = assessHighRiskSave({
    absDeltaSum,
    cells: changedCells,
    suspicious,
    confirmForceSave,
  });

  const gate = assertHighRiskGate(highRisk, forceSave, reason.length);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: gate.message,
        code: gate.code,
        warnings: suspicious.warnings,
 },
      { status: 400 }
    );
  }

  const keys = changedCells.map((c) => ({
    boutiqueId,
    dateKey: c.dateKey,
    userId: c.userId,
  }));
  const existingRows = await prisma.salesEntry.findMany({
    where: { OR: keys },
    select: { dateKey: true, userId: true, amount: true },
  });
  const existingMap = new Map<string, number>();
  for (const r of existingRows) {
    existingMap.set(`${r.dateKey}\t${r.userId}`, r.amount);
  }

  const stale: Array<{ dateKey: string; userId: string; expectedOld: number; actual: number }> = [];
  for (const c of changedCells) {
    const k = `${c.dateKey}\t${c.userId}`;
    const actual = existingMap.has(k) ? existingMap.get(k)! : 0;
    if (actual !== c.oldAmount) {
      stale.push({ dateKey: c.dateKey, userId: c.userId, expectedOld: c.oldAmount, actual });
    }
  }
  if (stale.length > 0) {
    await logMatrixSecureActivity({
      unlockSessionId,
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'SAVE_FAILURE',
      detail: 'stale_client',
      meta: { staleCount: stale.length },
    });
    return NextResponse.json(
      { error: 'Data changed since load. Refresh and retry.', stale },
      { status: 409 }
    );
  }

  const payload = await getMonthlyMatrixPayload({
    boutiqueId,
    monthParam: month,
    includePreviousMonth: false,
    ledgerOnly: false,
    includeUserIds: true,
  });
  if ('error' in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const snapshotData = {
    month: payload.month,
    days: payload.days,
    matrix: payload.matrix,
    employees: payload.employees.map((e) => ({
      empId: e.empId,
      name: e.name,
      userId: e.userId,
    })),
    grandTotalSar: payload.grandTotalSar,
  };

  const saveBatchId = randomUUID();
  const actorRole = user.role;
  const results: Array<{ dateKey: string; userId: string; ok: boolean; error?: string }> = [];

  await logMatrixSecureActivity({
    unlockSessionId,
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'SAVE_ATTEMPT',
    meta: {
      cellCount: changedCells.length,
      absDeltaSum,
      saveBatchId,
      highRisk: highRisk.logAsHighRisk,
    },
  });

  if (highRisk.logAsHighRisk && highRisk.requiresForceSaveReason && forceSave) {
    await logMatrixSecureActivity({
      unlockSessionId,
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'HIGH_RISK_EDIT',
      detail: 'confirmed_force_save',
      meta: { saveBatchId, absDeltaSum, warnings: suspicious.warnings },
    });
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.salesMatrixSnapshot.create({
        data: {
          boutiqueId,
          month,
          data: JSON.parse(JSON.stringify(snapshotData)) as Prisma.InputJsonValue,
          grandTotalSar: payload.grandTotalSar,
          saveBatchId,
          createdById: user.id,
        },
      });

      for (const c of changedCells) {
        let dateNorm: Date;
        try {
          dateNorm = dateKeyToUTCNoon(c.dateKey);
        } catch {
          throw new Error(`bad_date:${c.dateKey}`);
        }

        const res = await upsertCanonicalSalesEntry({
          kind: 'direct',
          boutiqueId,
          userId: c.userId,
          amount: c.newAmount,
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
          const msg =
            res.status === 'rejected_invalid'
              ? res.reason
              : res.status === 'rejected_locked'
                ? 'locked'
                : 'precedence';
          throw new Error(`${c.dateKey}:${c.userId}:${msg}`);
        }

        const delta = c.newAmount - c.oldAmount;
        await tx.salesMatrixEditCellAudit.create({
          data: {
            unlockSessionId,
            saveBatchId,
            actorUserId: user.id,
            actorRole,
            boutiqueId,
            month,
            dateKey: c.dateKey,
            targetUserId: c.userId,
            oldAmount: c.oldAmount,
            newAmount: c.newAmount,
            delta,
            reason,
            sourcePage: MATRIX_SECURE_EDIT_PAGE,
          },
        });

        results.push({ dateKey: c.dateKey, userId: c.userId, ok: true });
      }

      await finalizeMatrixVersionInTx(tx, boutiqueId, month, clientMatrixVersion);
    });
  } catch (e) {
    if (e instanceof MatrixVersionConflictError) {
      await logMatrixSecureActivity({
        unlockSessionId,
        actorUserId: user.id,
        boutiqueId,
        month,
        eventType: 'SAVE_FAILURE',
        detail: 'matrix_version_race',
        meta: { currentVersion: e.currentVersion },
      });
      return NextResponse.json(
        {
          error: 'Concurrent update detected. Refresh and retry.',
          code: 'MATRIX_VERSION_CONFLICT',
          matrixVersion: e.currentVersion,
        },
        { status: 409 }
      );
    }
    const msg = e instanceof Error ? e.message : 'transaction_failed';
    await logMatrixSecureActivity({
      unlockSessionId,
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'SAVE_FAILURE',
      detail: msg,
      meta: { saveBatchId },
    });
    return NextResponse.json({ error: 'Save failed', detail: msg, results }, { status: 500 });
  }

  const newMatrixVersion = await prisma.salesMatrixEditVersion.findUnique({
    where: { boutiqueId_month: { boutiqueId, month } },
    select: { version: true },
  });

  await logMatrixSecureActivity({
    unlockSessionId,
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'SAVE_SUCCESS',
    meta: { saved: results.length, saveBatchId, matrixVersion: newMatrixVersion?.version },
  });

  if (autoLock) {
    await revokeUnlockSession(unlockSessionId, user.id);
    await logMatrixSecureActivity({
      unlockSessionId,
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'LOCK',
      detail: 'auto_after_save',
    });
  }

  return NextResponse.json({
    ok: true,
    saved: results.length,
    saveBatchId,
    matrixVersion: newMatrixVersion?.version ?? clientMatrixVersion + 1,
    results,
    locked: autoLock,
  });
}
