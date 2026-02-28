import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { markWeeklyZoneCompleted } from '@/lib/services/inventoryZones';
import { prisma } from '@/lib/db';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const weekStart = body.weekStart as string | undefined;
  const zoneId = body.zoneId as string | undefined;
  if (!weekStart || !zoneId) {
    return NextResponse.json({ error: 'weekStart and zoneId required' }, { status: 400 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  try {
    await assertScheduleEditable({ weekStart, boutiqueId: scheduleScope.boutiqueId });
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

  const run = await prisma.inventoryWeeklyZoneRun.findUnique({
    where: {
      weekStart_zoneId: {
        weekStart: new Date(weekStart + 'T00:00:00Z'),
        zoneId,
      },
    },
  });
  if (run && run.empId !== user.empId && user.role !== 'MANAGER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only assigned employee or manager/admin can mark completed' }, { status: 403 });
  }

  const beforeRun = run;
  const result = await markWeeklyZoneCompleted(weekStart, zoneId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 400 });
  }
  const afterRun = await prisma.inventoryWeeklyZoneRun.findUnique({
    where: { weekStart_zoneId: { weekStart: new Date(weekStart + 'T00:00:00Z'), zoneId } },
  });
  await logAudit(
    user.id,
    'ZONE_COMPLETED',
    'InventoryWeeklyZoneRun',
    zoneId,
    beforeRun ? JSON.stringify({ status: beforeRun.status, empId: beforeRun.empId }) : null,
    afterRun ? JSON.stringify({ status: afterRun.status, empId: afterRun.empId }) : null,
    null,
    { module: 'INVENTORY', targetEmployeeId: user.empId, weekStart }
  );
  return NextResponse.json({ ok: true });
}
