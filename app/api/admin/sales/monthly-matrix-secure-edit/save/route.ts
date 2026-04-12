/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/save
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { prisma } from '@/lib/db';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { monthDaysUTC } from '@/lib/dates/safeCalendar';
import {
  assertAdminMatrixSecureEditRole,
  getValidUnlockSession,
  logMatrixSecureActivity,
  revokeUnlockSession,
} from '@/lib/matrixSecureEdit/session';
import { dateKeyToUTCNoon } from '@/lib/matrixSecureEdit/dateKeyToDate';
import {
  MAX_ABS_DELTA_BATCH_SAR,
  MAX_CELL_SAR,
  MATRIX_SECURE_EDIT_PAGE,
  REASON_MIN_LEN,
} from '@/lib/matrixSecureEdit/constants';
import type { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

type ChangedCellInput = { dateKey: string; userId: string; oldAmount: number; newAmount: number };

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

  if (!Array.isArray(changedCellsRaw) || changedCellsRaw.length === 0) {
    return NextResponse.json({ error: 'changedCells must be a non-empty array' }, { status: 400 });
  }

  const allowedDays = new Set(monthDaysUTC(month));
  const allowedUserIds = new Set(
    (
      await prisma.user.findMany({
        where: {
          disabled: false,
          employee: { boutiqueId, isSystemOnly: false, active: true },
        },
        select: { id: true },
      })
    ).map((u) => u.id)
  );
  // Include users who have sales this month at this boutique (historical rows)
  const extraUserIds = await prisma.salesEntry.findMany({
    where: { boutiqueId, month },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const r of extraUserIds) allowedUserIds.add(r.userId);

  const changedCells: ChangedCellInput[] = [];
  for (const raw of changedCellsRaw) {
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid changedCells entry' }, { status: 400 });
    }
    const dateKey = typeof raw.dateKey === 'string' ? raw.dateKey.trim() : '';
    const uid = typeof raw.userId === 'string' ? raw.userId.trim() : '';
    const oldAmount = Number(raw.oldAmount);
    const newAmount = Number(raw.newAmount);
    if (!dateKey || !allowedDays.has(dateKey)) {
      return NextResponse.json({ error: `Invalid dateKey: ${dateKey}` }, { status: 400 });
    }
    if (!uid || !allowedUserIds.has(uid)) {
      return NextResponse.json({ error: 'Invalid or out-of-scope userId' }, { status: 400 });
    }
    if (!Number.isInteger(oldAmount) || oldAmount < 0 || !Number.isInteger(newAmount) || newAmount < 0) {
      return NextResponse.json({ error: 'Amounts must be non-negative integers' }, { status: 400 });
    }
    if (newAmount > MAX_CELL_SAR) {
      return NextResponse.json(
        { error: `Per-cell amount exceeds maximum (${MAX_CELL_SAR} SAR)` },
        { status: 400 }
      );
    }
    if (oldAmount === newAmount) continue;
    changedCells.push({ dateKey, userId: uid, oldAmount, newAmount });
  }

  if (changedCells.length === 0) {
    return NextResponse.json({ error: 'No effective changes after validation' }, { status: 400 });
  }

  let absDeltaSum = 0;
  for (const c of changedCells) absDeltaSum += Math.abs(c.newAmount - c.oldAmount);
  if (absDeltaSum > MAX_ABS_DELTA_BATCH_SAR) {
    return NextResponse.json(
      {
        error: `Total change magnitude exceeds safety limit (${MAX_ABS_DELTA_BATCH_SAR} SAR). Split saves or contact engineering.`,
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

  await logMatrixSecureActivity({
    unlockSessionId,
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'SAVE_ATTEMPT',
    meta: { cellCount: changedCells.length, absDeltaSum },
  });

  const results: Array<{ dateKey: string; userId: string; ok: boolean; error?: string }> = [];
  const actorRole = user.role;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'transaction_failed';
    await logMatrixSecureActivity({
      unlockSessionId,
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'SAVE_FAILURE',
      detail: msg,
    });
    return NextResponse.json({ error: 'Save failed', detail: msg, results }, { status: 500 });
  }

  await logMatrixSecureActivity({
    unlockSessionId,
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'SAVE_SUCCESS',
    meta: { saved: results.length },
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
    results,
    locked: autoLock,
  });
}
