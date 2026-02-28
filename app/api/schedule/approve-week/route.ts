import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { approveWeek } from '@/lib/services/scheduleLock';
import { getEffectiveAccess } from '@/lib/rbac/effectiveAccess';
import { ensureTaskKeysForApprovedWeekWithTx } from '@/lib/sync/ensureTaskKeys';
import { prisma } from '@/lib/db';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { emitEvent } from '@/lib/notify/emitEvent';
import { emitTaskAssignedForWeek } from '@/lib/notify/emitTaskAssignedForWeek';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const access = await getEffectiveAccess(
    { id: user.id, role: user.role as import('@prisma/client').Role, canEditSchedule: user.canEditSchedule },
    scheduleScope.boutiqueId
  );
  if (!access.effectiveFlags.canApproveWeek && access.effectiveRole !== 'MANAGER' && access.effectiveRole !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Forbidden', messageKey: 'schedule.approvalNotAllowed' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const weekStart = String(body.weekStart ?? '').trim();
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart (YYYY-MM-DD, Saturday) required' }, { status: 400 });
  }
  const d = new Date(weekStart + 'T00:00:00Z');
  if (d.getUTCDay() !== 6) {
    return NextResponse.json({ error: 'weekStart must be a Saturday' }, { status: 400 });
  }

  await approveWeek(weekStart, scheduleScope.boutiqueId, user.id);

  const weekEnd = new Date(d);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekRange = `${weekStart} – ${weekEnd.toISOString().slice(0, 10)}`;

  let keyResult: { backfilled: number; totalInScope: number; remainingNull: number };
  try {
    keyResult = await prisma.$transaction(async (tx) => {
      return ensureTaskKeysForApprovedWeekWithTx(tx, weekStart);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[Approve Week] taskKey backfill failed: ${msg}`);
    return NextResponse.json(
      { error: msg || 'Task key backfill failed' },
      { status: 500 }
    );
  }

  console.log(
    `[Approve Week] weekStart=${weekStart} period=${weekRange} totalInScope=${keyResult.totalInScope} backfilled=${keyResult.backfilled} remainingNull=${keyResult.remainingNull}`
  );

  await logAudit(
    user.id,
    'WEEK_APPROVED',
    'ScheduleWeekStatus',
    weekStart,
    null,
    JSON.stringify({ weekStart }),
    'Week approved',
    { module: 'SCHEDULE', weekStart }
  );

  const weekEndStr = weekEnd.toISOString().slice(0, 10);
  const boutiqueUsers = await prisma.user.findMany({
    where: { boutiqueId: scheduleScope.boutiqueId, disabled: false },
    select: { id: true },
  });
  const affectedUserIds = boutiqueUsers.map((u) => u.id);
  void emitEvent('SCHEDULE_PUBLISHED', {
    boutiqueId: scheduleScope.boutiqueId,
    affectedUserIds,
    payload: { weekStart, weekEnd: weekEndStr },
  });
  void emitTaskAssignedForWeek(weekStart, scheduleScope.boutiqueId);

  return NextResponse.json({ ok: true, weekStart, status: 'APPROVED' });
}
