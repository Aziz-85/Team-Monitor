/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/lock
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import {
  assertAdminMatrixSecureEditRole,
  logMatrixSecureActivity,
  revokeUnlockSession,
} from '@/lib/matrixSecureEdit/session';
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
  const sessionId = typeof body.unlockSessionId === 'string' ? body.unlockSessionId.trim() : '';
  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: 'unlockSessionId required' }, { status: 400 });
  }

  const revoked = await revokeUnlockSession(sessionId, user.id);
  await logMatrixSecureActivity({
    unlockSessionId: sessionId,
    actorUserId: user.id,
    boutiqueId,
    month,
    eventType: 'LOCK',
    detail: revoked ? 'revoked' : 'no_active_session',
  });

  return NextResponse.json({ ok: true, revoked });
}
