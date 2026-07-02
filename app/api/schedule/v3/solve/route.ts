import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { loadFairnessContext, buildEmployeeFairness } from '@/lib/services/schedulePlannerFairness';
import { loadWeekGuestShifts } from '@/lib/services/schedulePlanGuests';
import { getRamadanRange } from '@/lib/time/ramadan';
import { buildGenerateScheduleInput } from '@/lib/schedule/generateSchedule/buildInput';
import { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
import { generateResultToPlanActions } from '@/lib/schedule/generateSchedule/toPlanActions';
import { buildWeekOperatingConfigs } from '@/lib/schedule/generateSchedule/operatingPeriods';
import type { Role } from '@prisma/client';

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

function computeMetrics(
  result: ReturnType<typeof generateSchedule>,
  guestShiftCount: number
) {
  const splitCount = result.assignments.filter((a) => a.splitDay).length;
  const overtimeCount = result.employeeSummaries.filter((s) => s.overtimeHours > 0).length;
  const externalSupportCount =
    result.assignments.filter((a) => a.isExternalSupport && a.shiftKind !== 'Off' && a.shiftKind !== 'Leave')
      .length || guestShiftCount;

  return {
    coverageValid: result.coverageValid,
    slotViolationCount: result.slotViolations.length,
    fairnessScore: result.fairnessScore,
    splitCount,
    overtimeCount,
    externalSupportCount,
  };
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(EDIT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canEditSchedule(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  let body: { weekStart?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const boutiqueIds = scheduleScope.boutiqueIds;
    const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds });
    const empIds = grid.rows.map((r) => r.empId);
    const ramadanRange = getRamadanRange();
    const weekDates = grid.days.map((d) => d.date);
    const dayOperatingConfigs = buildWeekOperatingConfigs(weekDates, ramadanRange);

    const [fairnessContext, guestShifts] = await Promise.all([
      loadFairnessContext(weekStart, empIds),
      loadWeekGuestShifts(weekStart, boutiqueIds),
    ]);
    const fairnessRows = buildEmployeeFairness(grid.rows, fairnessContext);

    const input = buildGenerateScheduleInput(grid, {
      guestShifts,
      fairnessRows,
      ramadanRange,
    });
    const generateResult = generateSchedule(input);
    const actions = generateResultToPlanActions(generateResult, grid.rows);
    const metrics = computeMetrics(generateResult, guestShifts.length);

    return NextResponse.json({
      weekStart: generateResult.weekStart,
      mode: generateResult.mode,
      generateResult,
      actions,
      dayOperatingConfigs,
      metrics,
      guestShiftCount: guestShifts.length,
      scenariosTried: generateResult.scenariosTried,
    });
  } catch (e) {
    console.error('[schedule/v3/solve]', e);
    const message = e instanceof Error ? e.message : 'Failed to solve schedule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
