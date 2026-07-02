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
import type { EmployeeDayAssignment, GenerateScheduleResult } from '@/lib/schedule/generateSchedule/types';
import type { PlanAction } from '@/lib/services/schedulePlanner';

/** Long solves on VPS; keepalive stream avoids nginx 504 when proxy_read_timeout is 60s. */
export const maxDuration = 300;

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const KEEPALIVE_MS = 10_000;

function computeMetrics(result: GenerateScheduleResult, guestShiftCount: number) {
  const splitCount = result.assignments.filter((a) => a.splitDay).length;
  const overtimeCount = result.employeeSummaries.filter((s) => s.overtimeHours > 0).length;
  const externalSupportCount =
    result.assignments.filter(
      (a) => a.isExternalSupport && a.shiftKind !== 'Off' && a.shiftKind !== 'Leave'
    ).length || guestShiftCount;

  return {
    coverageValid: result.coverageValid,
    slotViolationCount: result.slotViolations.length,
    fairnessScore: result.fairnessScore,
    splitCount,
    overtimeCount,
    externalSupportCount,
  };
}

function slimAssignments(assignments: EmployeeDayAssignment[]) {
  return assignments.map((a) => ({
    empId: a.empId,
    name: a.name,
    date: a.date,
    isExternalSupport: a.isExternalSupport,
    segments: a.segments,
    shiftKind: a.shiftKind,
    totalHours: a.totalHours,
    splitDay: a.splitDay,
  }));
}

function slimActions(actions: PlanAction[]) {
  return actions.map((a) => ({
    id: a.id,
    type: a.type,
    date: a.date,
    dayIndex: a.dayIndex,
    empId: a.empId,
    employeeName: a.employeeName,
    fromShift: a.fromShift,
    toShift: a.toShift,
    reason: a.reason,
    segments: a.segments,
  }));
}

async function computeSolvePayload(weekStart: string, boutiqueIds: string[]) {
  const t0 = Date.now();
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

  if (process.env.NODE_ENV !== 'test') {
    console.log('[schedule/v3/solve]', {
      weekStart,
      ms: Date.now() - t0,
      employees: empIds.length,
      scenariosTried: generateResult.scenariosTried,
      actions: actions.length,
      coverageValid: generateResult.coverageValid,
    });
  }

  return {
    weekStart: generateResult.weekStart,
    mode: generateResult.mode,
    generateResult: {
      weekStart: generateResult.weekStart,
      mode: generateResult.mode,
      assignments: slimAssignments(generateResult.assignments),
      warnings: generateResult.warnings,
      coverageValid: generateResult.coverageValid,
      slotViolations: generateResult.slotViolations,
      fairnessScore: generateResult.fairnessScore,
      employeeSummaries: generateResult.employeeSummaries,
      scenariosTried: generateResult.scenariosTried,
    },
    actions: slimActions(actions),
    dayOperatingConfigs,
    metrics,
    guestShiftCount: guestShifts.length,
    scenariosTried: generateResult.scenariosTried,
  };
}

function migrationHint(message: string): string {
  if (message.includes('ShiftOverrideSegment') || message.includes('does not exist')) {
    return ' Database migration may be pending — run: npx prisma migrate deploy';
  }
  return '';
}

/** Stream newlines while solving so nginx proxy_read_timeout resets (60s default). */
function streamSolveResponse(weekStart: string, boutiqueIds: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, KEEPALIVE_MS);

      try {
        const payload = await computeSolvePayload(weekStart, boutiqueIds);
        controller.enqueue(encoder.encode(JSON.stringify(payload)));
      } catch (e) {
        console.error('[schedule/v3/solve]', e);
        const message = e instanceof Error ? e.message : 'Failed to solve schedule';
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: message + migrationHint(message) }))
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      /** Disable nginx response buffering so keepalive bytes reach the client/proxy. */
      'X-Accel-Buffering': 'no',
    },
  });
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

  return streamSolveResponse(weekStart, scheduleScope.boutiqueIds);
}
