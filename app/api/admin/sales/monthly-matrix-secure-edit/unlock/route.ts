/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/unlock
 * Re-authenticate with the signed-in user's account password (no shared env passcode).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser, verifyUserPassword } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import {
  assertAdminMatrixSecureEditRole,
  assertUnlockThrottleOk,
  createUnlockSession,
  logMatrixSecureActivity,
  MATRIX_SECURE_EDIT_PAGE,
} from '@/lib/matrixSecureEdit/session';
import { REASON_MIN_LEN, MATRIX_UNLOCK_GENERIC_ERROR } from '@/lib/matrixSecureEdit/constants';
import { getRequestClientIp } from '@/lib/matrixSecureEdit/requestMeta';
import type { Role } from '@prisma/client';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];
const AUTH_METHOD = 'PASSWORD_REAUTH';

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
  const password = typeof body.password === 'string' ? body.password : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const confirmLive = body.confirmLive === true;
  const bodyBoutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() : '';

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

  const clientIp = getRequestClientIp(request);

  if (bodyBoutiqueId && bodyBoutiqueId !== boutiqueId) {
    await logMatrixSecureActivity({
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'UNLOCK_FAILURE',
      detail: 'boutique_scope_mismatch',
      meta: { clientIp, authMethod: AUTH_METHOD, sourcePage: MATRIX_SECURE_EDIT_PAGE },
    });
    return NextResponse.json({ error: MATRIX_UNLOCK_GENERIC_ERROR }, { status: 401 });
  }

  if (!(await assertUnlockThrottleOk(user.id))) {
    await logMatrixSecureActivity({
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'UNLOCK_FAILURE',
      detail: 'throttled',
      meta: { clientIp, authMethod: AUTH_METHOD, sourcePage: MATRIX_SECURE_EDIT_PAGE },
    });
    return NextResponse.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 });
  }

  const passwordOk = await verifyUserPassword(user.id, password);
  if (!passwordOk) {
    await logMatrixSecureActivity({
      actorUserId: user.id,
      boutiqueId,
      month,
      eventType: 'UNLOCK_FAILURE',
      detail: 'invalid_password_reauth',
      meta: { clientIp, authMethod: AUTH_METHOD, sourcePage: MATRIX_SECURE_EDIT_PAGE },
    });
    return NextResponse.json({ error: MATRIX_UNLOCK_GENERIC_ERROR }, { status: 401 });
  }

  const { id, expiresAt } = await createUnlockSession({
    userId: user.id,
    boutiqueId,
    month,
    reason,
    unlockAuthMethod: AUTH_METHOD,
  });

  await logMatrixSecureActivity({
    unlockSessionId: id,
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'UNLOCK_SUCCESS',
    meta: {
      expiresAt: expiresAt.toISOString(),
      clientIp,
      authMethod: AUTH_METHOD,
      sourcePage: MATRIX_SECURE_EDIT_PAGE,
      reasonLen: reason.length,
    },
  });

  return NextResponse.json({
    ok: true,
    sessionId: id,
    expiresAt: expiresAt.toISOString(),
    authMethod: AUTH_METHOD,
  });
}
