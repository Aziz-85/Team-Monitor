/**
 * GET /api/admin/sales/monthly-matrix-secure-edit/history?month=YYYY-MM&limit=50
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { prisma } from '@/lib/db';
import { assertAdminMatrixSecureEditRole } from '@/lib/matrixSecureEdit/session';
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

  const limit = Math.min(80, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 40));

  const [activities, cellGroups] = await Promise.all([
    prisma.salesMatrixEditActivityLog.findMany({
      where: { boutiqueId, month: monthKey },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        detail: true,
        createdAt: true,
        actorUserId: true,
        unlockSessionId: true,
        meta: true,
      },
    }),
    prisma.salesMatrixEditCellAudit.groupBy({
      by: ['unlockSessionId'],
      where: { boutiqueId, month: monthKey },
      _count: { id: true },
    }),
  ]);
  const cellCountBySession = new Map(cellGroups.map((g) => [g.unlockSessionId, g._count.id]));

  const actorIds = Array.from(new Set(activities.map((a) => a.actorUserId)));
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, empId: true, employee: { select: { name: true } } },
  });
  const actorLabel = new Map(
    actors.map((a) => [a.id, a.employee?.name ?? a.empId])
  );

  return NextResponse.json({
    month: monthKey,
    boutiqueId,
    entries: activities.map((a) => ({
      id: a.id,
      eventType: a.eventType,
      detail: a.detail,
      createdAt: a.createdAt.toISOString(),
      actorUserId: a.actorUserId,
      actorLabel: actorLabel.get(a.actorUserId) ?? a.actorUserId,
      unlockSessionId: a.unlockSessionId,
      cellsInSession: a.unlockSessionId ? (cellCountBySession.get(a.unlockSessionId) ?? 0) : 0,
      meta: a.meta,
    })),
  });
}
