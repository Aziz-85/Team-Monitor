/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/unlock
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import {
  assertAdminMatrixSecureEditRole,
  assertUnlockThrottleOk,
  createUnlockSession,
  logMatrixSecureActivity,
} from '@/lib/matrixSecureEdit/session';
import {
  isMonthlyMatrixEditPasscodeConfigured,
  verifyMonthlyMatrixEditPasscode,
} from '@/lib/matrixSecureEdit/passcode';
import { REASON_MIN_LEN } from '@/lib/matrixSecureEdit/constants';
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
  const passcode = typeof body.passcode === 'string' ? body.passcode : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const confirmLive = body.confirmLive === true;

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (reason.length < REASON_MIN_LEN) {
    return NextResponse.json(
      { error: `reason must be at least ${REASON_MIN_LEN} characters` },
      { status: 400 }
    );
  }
  if (!confirmLive) {
    return NextResponse.json(
      { error: 'You must confirm that you are editing live production sales data.' },
      { status: 400 }
    );
  }

  if (!(await assertUnlockThrottleOk(user.id))) {
    await logMatrixSecureActivity({
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'UNLOCK_FAILURE',
      detail: 'throttled',
    });
    return NextResponse.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 });
  }

  if (!isMonthlyMatrixEditPasscodeConfigured()) {
    return NextResponse.json(
      { error: 'Server is not configured for matrix edit passcode (MONTHLY_MATRIX_EDIT_PASSCODE_HASH).' },
      { status: 503 }
    );
  }

  const ok = await verifyMonthlyMatrixEditPasscode(passcode);
  if (!ok) {
    await logMatrixSecureActivity({
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'UNLOCK_FAILURE',
      detail: 'invalid_passcode',
    });
    return NextResponse.json({ error: 'Unlock failed.' }, { status: 401 });
  }

  const { id, expiresAt } = await createUnlockSession({
    userId: user.id,
    boutiqueId,
    month,
    reason,
  });

  await logMatrixSecureActivity({
    unlockSessionId: id,
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'UNLOCK_SUCCESS',
    meta: { expiresAt: expiresAt.toISOString() },
  });

  return NextResponse.json({
    ok: true,
    sessionId: id,
    expiresAt: expiresAt.toISOString(),
  });
}
