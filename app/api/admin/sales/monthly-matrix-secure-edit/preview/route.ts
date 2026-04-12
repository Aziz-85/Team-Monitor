/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/preview
 * Validates changed cells and returns human-readable diff + risk flags (no writes).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { prisma } from '@/lib/db';
import { assertAdminMatrixSecureEditRole, getValidUnlockSession } from '@/lib/matrixSecureEdit/session';
import {
  parseChangedCells,
  sumCellDeltas,
  validateClientDeltaClaim,
  validateGrandTotalAfterClaim,
  analyzeSuspiciousPatterns,
  assessHighRiskSave,
  assertHighRiskGate,
} from '@/lib/matrixSecureEdit/saveValidation';
import { loadAllowedUserIdsForMatrixMonth, monthDayKeys } from '@/lib/matrixSecureEdit/saveContext';
import { getMatrixEditVersion } from '@/lib/matrixSecureEdit/versioning';
import { REASON_HIGH_RISK_MIN_LEN } from '@/lib/matrixSecureEdit/constants';
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
  const changedCellsRaw = body.changedCells;
  const clientMatrixVersion = Number(body.matrixVersion);
  const confirmForceSave = body.confirmForceSave === true;
  const forceSave = body.forceSave === true;

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (!unlockSessionId) {
    return NextResponse.json({ error: 'unlockSessionId required' }, { status: 400 });
  }
  if (!Number.isInteger(clientMatrixVersion) || clientMatrixVersion < 0) {
    return NextResponse.json({ error: 'matrixVersion must be a non-negative integer' }, { status: 400 });
  }

  const session = await getValidUnlockSession(unlockSessionId, user.id, boutiqueId, month);
  if (!session) {
    return NextResponse.json({ error: 'Unlock session expired or invalid. Unlock again.' }, { status: 403 });
  }

  const serverMatrixVersion = await getMatrixEditVersion(boutiqueId, month);
  if (serverMatrixVersion !== clientMatrixVersion) {
    return NextResponse.json(
      {
        error: 'Matrix was updated by another session. Refresh and retry.',
        code: 'MATRIX_VERSION_CONFLICT',
        matrixVersion: serverMatrixVersion,
      },
      { status: 409 }
    );
  }

  const allowedDays = monthDayKeys(month);
  const allowedUserIds = await loadAllowedUserIdsForMatrixMonth(boutiqueId, month);

  const parsed = parseChangedCells(changedCellsRaw, allowedDays, allowedUserIds);
  if (!parsed.ok) {
    const e = parsed.error;
    const status =
      e.code === 'BATCH_LIMIT' || e.code === 'INVALID_ENTRY' || e.code === 'DUPLICATE_CELL'
        ? 400
        : 400;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
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

  const saveReadiness = assertHighRiskGate(highRisk, forceSave, reason.length);

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

  const userIds = Array.from(new Set(changedCells.map((c) => c.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, empId: true, employee: { select: { name: true } } },
  });
  const userMeta = new Map(
    users.map((u) => [
      u.id,
      { empId: u.empId, name: u.employee?.name ?? u.empId },
    ])
  );

  const changedRows = changedCells.map((c) => {
    const m = userMeta.get(c.userId);
    return {
      userId: c.userId,
      empId: m?.empId ?? c.userId,
      name: m?.name ?? '',
      dateKey: c.dateKey,
      oldAmount: c.oldAmount,
      newAmount: c.newAmount,
      delta: c.newAmount - c.oldAmount,
    };
  });

  const deltaSum = sumCellDeltas(changedCells);

  return NextResponse.json({
    ok: true,
    previewId: randomUUID(),
    matrixVersion: serverMatrixVersion,
    changedRows,
    totals: {
      oldGrand: grandBefore,
      newGrand: grandClaim.expectedGrandAfter,
      delta: deltaSum,
    },
    warnings: suspicious.warnings,
    requiresForceSaveReason: highRisk.requiresForceSaveReason,
    needsConfirmForceSave: highRisk.needsConfirmForceSave,
    logAsHighRisk: highRisk.logAsHighRisk,
    saveReady:
      stale.length === 0 &&
      saveReadiness.ok &&
      (!highRisk.requiresForceSaveReason ||
        (forceSave && reason.length >= REASON_HIGH_RISK_MIN_LEN)),
    saveBlockedReason: !saveReadiness.ok ? saveReadiness.code : stale.length ? 'STALE_DATA' : null,
    stale: stale.length ? stale : null,
  });
}
