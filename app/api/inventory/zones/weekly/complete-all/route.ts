import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWeeklyRuns, weekStartFor } from '@/lib/services/inventoryZones';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/inventory/zones/weekly/complete-all
 * Body: { weekStart: "YYYY-MM-DD" }
 * Normalizes weekStart to Saturday week start, ensures runs exist (same as GET weekly), then completes all runs for the session user.
 * RBAC: only own zones (run.empId === session.empId).
 */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const weekStartParam = body.weekStart as string | undefined;
  if (!weekStartParam || typeof weekStartParam !== 'string') {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }
  const inputDate = new Date(weekStartParam + 'T12:00:00Z');
  if (Number.isNaN(inputDate.getTime())) {
    return NextResponse.json({ error: 'Invalid weekStart' }, { status: 400 });
  }

  const weekStartNormalized = weekStartFor(inputDate);
  const weekStartDate = new Date(weekStartNormalized + 'T00:00:00Z');

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'Select a boutique in the scope selector.' }, { status: 403 });
  }
  const boutiqueId = scheduleScope.boutiqueId;
  try {
    await assertScheduleEditable({ weekStart: weekStartNormalized, boutiqueId });
  } catch (e) {
    if (e instanceof ScheduleLockedError) {
      const lockInfo = e.lockInfo;
      const message = lockInfo?.reason
        ? `This week is locked. Reason: ${lockInfo.reason}`
        : 'This week is locked';
      return NextResponse.json(
        {
          error: message,
          code: e.code,
          lock: lockInfo
            ? {
                scope: lockInfo.scopeType,
                weekStart: lockInfo.scopeValue,
                reason: lockInfo.reason,
                lockedBy: lockInfo.lockedByUserId,
                lockedAt: lockInfo.lockedAt.toISOString(),
              }
            : undefined,
        },
        { status: 423 }
      );
    }
    throw e;
  }

  await getWeeklyRuns(boutiqueId, weekStartNormalized);

  const myRuns = await prisma.inventoryWeeklyZoneRun.findMany({
    where: {
      weekStart: weekStartDate,
      empId: user.empId,
    },
    select: { id: true, status: true },
  });

  const totalMyZones = myRuns.length;
  const alreadyCompletedCount = myRuns.filter((r) => r.status === 'COMPLETED').length;

  const result = await prisma.inventoryWeeklyZoneRun.updateMany({
    where: {
      weekStart: weekStartDate,
      empId: user.empId,
      status: { not: 'COMPLETED' },
    },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  const updatedCount = result.count;

  await logAudit(
    user.id,
    'WEEKLY_COMPLETE_ALL',
    'InventoryWeeklyZoneRun',
    weekStartNormalized,
    JSON.stringify({ totalMyZones, alreadyCompletedCount }),
    JSON.stringify({ updatedCount, totalMyZones, alreadyCompletedCount }),
    null,
    { module: 'INVENTORY', targetEmployeeId: user.empId, weekStart: weekStartNormalized }
  );

  let message: string;
  if (totalMyZones === 0) {
    message = 'No zones assigned';
  } else if (updatedCount === 0 && alreadyCompletedCount === totalMyZones) {
    message = 'All already completed';
  } else {
    message = '';
  }

  return NextResponse.json({
    weekStartNormalized,
    updatedCount,
    totalMyZones,
    alreadyCompletedCount,
    message,
  });
}
