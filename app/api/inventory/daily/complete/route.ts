import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { markDailyCompleted } from '@/lib/services/inventoryDaily';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireSession>>;
  try {
    user = await requireSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const body = await request.json().catch(() => ({}));
  const dateParam = body.date as string | undefined;
  if (!dateParam) {
    return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
  }
  const date = new Date(dateParam + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'Select a boutique in the scope selector.' }, { status: 403 });
  }
  try {
    await assertScheduleEditable({ dates: [dateParam], boutiqueId: scheduleScope.boutiqueId });
  } catch (e) {
    if (e instanceof ScheduleLockedError) {
      const lockInfo = e.lockInfo;
      const message = lockInfo?.reason
        ? `This day is locked. Reason: ${lockInfo.reason}`
        : 'This day is locked';
      return NextResponse.json(
        {
          error: message,
          code: e.code,
          lock: lockInfo
            ? {
                scope: lockInfo.scopeType,
                date: lockInfo.scopeValue,
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

  const beforeRun = await prisma.inventoryDailyRun.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
  });
  const result = await markDailyCompleted(boutiqueId, date, user.empId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 400 });
  }
  const afterRun = await prisma.inventoryDailyRun.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
  });
  await logAudit(
    user.id,
    'ZONE_COMPLETED',
    'InventoryDailyRun',
    dateParam,
    beforeRun ? JSON.stringify({ status: beforeRun.status, assignedEmpId: beforeRun.assignedEmpId }) : null,
    afterRun ? JSON.stringify({ status: afterRun.status, completedByEmpId: afterRun.completedByEmpId }) : null,
    null,
    { module: 'INVENTORY', targetEmployeeId: user.empId, targetDate: dateParam }
  );
  return NextResponse.json({ ok: true });
}
