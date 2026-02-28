import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import { getWeekStatus, getWeekLockInfo } from '@/lib/services/scheduleLock';
import type { Role } from '@prisma/client';

const VIEW_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(VIEW_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const weekStart = request.nextUrl.searchParams.get('weekStart') ?? '';
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart (YYYY-MM-DD) required' }, { status: 400 });
  }

  const status = await getWeekStatus(weekStart, scheduleScope.boutiqueId);
  const lockInfo = await getWeekLockInfo(weekStart, scheduleScope.boutiqueId);

  const userIds = new Set<string>();
  if (lockInfo) userIds.add(lockInfo.lockedByUserId);
  if (status?.approvedByUserId) userIds.add(status.approvedByUserId);
  const start = new Date(weekStart + 'T00:00:00Z');
  const weekDateStrs: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    weekDateStrs.push(d.toISOString().slice(0, 10));
  }
  const dayLocks = await prisma.scheduleLock.findMany({
    where: {
      scopeType: 'DAY',
      scopeValue: { in: weekDateStrs },
      boutiqueId: scheduleScope.boutiqueId,
      isActive: true,
    },
  });
  dayLocks.forEach((d) => userIds.add(d.lockedByUserId));

  const users =
    userIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, empId: true, role: true, employee: { select: { name: true } } },
        })
      : [];
  const userMap = Object.fromEntries(
    users.map((u) => [u.id, { name: u.employee?.name ?? u.empId, role: u.role }])
  );

  const weekLockDisplay = lockInfo
    ? (() => {
        const u = userMap[lockInfo.lockedByUserId];
        return {
          lockedByUserId: lockInfo.lockedByUserId,
          lockedByName: u?.name ?? null,
          lockedByRole: u?.role ?? null,
          lockedAt: lockInfo.lockedAt.toISOString(),
        };
      })()
    : null;

  const approvedByUser = status?.approvedByUserId ? userMap[status.approvedByUserId] : null;

  const lockedDaysDetails = dayLocks.map((d) => {
    const u = userMap[d.lockedByUserId];
    return {
      date: d.scopeValue,
      lockedByUserId: d.lockedByUserId,
      lockedByName: u?.name ?? null,
      lockedByRole: u?.role ?? null,
      lockedAt: d.lockedAt.toISOString(),
    };
  });

  return NextResponse.json({
    weekStart,
    scopeLabel: scheduleScope.label,
    status: status?.status ?? 'DRAFT',
    approvedByUserId: status?.approvedByUserId ?? null,
    approvedByName: approvedByUser?.name ?? null,
    approvedByRole: approvedByUser?.role ?? null,
    approvedAt: status?.approvedAt?.toISOString() ?? null,
    weekLock: weekLockDisplay,
    lockedDays: lockedDaysDetails.filter(Boolean),
  });
}
