/**
 * POST /api/admin/sales/monthly-matrix-secure-edit/discard — audit only (client cleared dirty state).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { assertAdminMatrixSecureEditRole, logMatrixSecureActivity } from '@/lib/matrixSecureEdit/session';
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

  const body = await request.json().catch(() => null);
  const month = typeof body?.month === 'string' ? normalizeMonthKey(body.month.trim()) : '';
  const unlockSessionId =
    typeof body?.unlockSessionId === 'string' ? body.unlockSessionId.trim() : undefined;
  const discardedCount = typeof body?.discardedCount === 'number' ? body.discardedCount : undefined;

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  await logMatrixSecureActivity({
    unlockSessionId: unlockSessionId || undefined,
    actorUserId: user.id,
    boutiqueId: scope.boutiqueId,
    month,
    eventType: 'DISCARD',
    meta: { discardedCount },
  });

  return NextResponse.json({ ok: true });
}
