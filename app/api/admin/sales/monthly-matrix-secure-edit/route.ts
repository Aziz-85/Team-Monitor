/**
 * GET /api/admin/sales/monthly-matrix-secure-edit?month=YYYY-MM
 * ADMIN / SUPER_ADMIN. Matrix data + userIds for editing + active unlock session metadata.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { getMonthlyMatrixPayload } from '@/lib/sales/monthlyMatrixPayload';
import { prisma } from '@/lib/db';
import { assertAdminMatrixSecureEditRole } from '@/lib/matrixSecureEdit/session';
import { getMatrixEditVersion } from '@/lib/matrixSecureEdit/versioning';
import type { Role } from '@prisma/client';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export async function GET(request: NextRequest) {
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

  const monthParam = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const monthKey = normalizeMonthKey(monthParam);
  if (!MONTH_REGEX.test(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const payload = await getMonthlyMatrixPayload({
    boutiqueId,
    monthParam: monthKey,
    includePreviousMonth: false,
    ledgerOnly: false,
    includeUserIds: true,
  });
  if ('error' in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const matrixVersion = await getMatrixEditVersion(boutiqueId, monthKey);

  const now = new Date();
  const activeUnlock = await prisma.salesMatrixEditUnlockSession.findFirst({
    where: {
      userId: user.id,
      boutiqueId,
      month: monthKey,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, expiresAt: true, reason: true, createdAt: true },
  });

  return NextResponse.json({
    ...payload,
    boutiqueLabel: scope.boutiqueLabel,
    matrixVersion,
    unlock: activeUnlock
      ? {
          sessionId: activeUnlock.id,
          expiresAt: activeUnlock.expiresAt.toISOString(),
          reason: activeUnlock.reason,
          createdAt: activeUnlock.createdAt.toISOString(),
        }
      : null,
  });
}
