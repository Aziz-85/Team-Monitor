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
import { getSchedulePolicy } from '@/lib/schedule/policyEngine';
import { qualityPercentsFromSolve } from '@/lib/schedule/scheduleQuality';
import { topSmartRecommendations } from '@/lib/schedule/recommendationEngine';
import { analyzeScheduleConstraints } from '@/lib/schedule/constraintAnalyzer';
import {
  ScheduleEnginePerfCollector,
  isSchedulePerfResponseEnabled,
  shouldLogSchedulePerf,
} from '@/lib/schedule/scheduleEnginePerf';
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

async function computeSolvePayload(
  weekStart: string,
  boutiqueIds: string[],
  options?: { preAnalyzed?: boolean; forcePartialSolve?: boolean }
): Promise<{ payload: Record<string, unknown> }> {
  const perf = new ScheduleEnginePerfCollector();

  const grid = await perf.timeAsync('loadGridMs', () => getScheduleGridForWeek(weekStart, { boutiqueIds }));
  const empIds = grid.rows.map((r) => r.empId);
  const ramadanRange = getRamadanRange();

  const [fairnessContext, guestShifts] = await Promise.all([
    perf.timeAsync('loadFairnessContextMs', () => loadFairnessContext(weekStart, empIds)),
    perf.timeAsync('loadGuestShiftsMs', () => loadWeekGuestShifts(weekStart, boutiqueIds)),
  ]);
  const fairnessRows = buildEmployeeFairness(grid.rows, fairnessContext);

  const input = buildGenerateScheduleInput(grid, {
    guestShifts,
    fairnessRows,
    ramadanRange,
    perf,
  });
  const generateResult = generateSchedule(input, {
    perf,
    preAnalyzed: options?.preAnalyzed,
    forcePartialSolve: options?.forcePartialSolve,
  });
  const actions = perf.timeSync('planActionsMs', () => generateResultToPlanActions(generateResult, grid.rows));
  const metrics = computeMetrics(generateResult, guestShifts.length);
  const dayOperatingConfigs = input.days;
  const policy = getSchedulePolicy(input);
  const qualityPercents = qualityPercentsFromSolve(metrics, generateResult.fairnessScore);
  const analysis = analyzeScheduleConstraints(input);
  const smartRecommendations =
    analysis.status === 'FEASIBLE' && generateResult.coverageValid
      ? []
      : topSmartRecommendations(
          {
            input,
            analysis,
            solverResult: {
              slotViolations: generateResult.slotViolations,
              coverageValid: generateResult.coverageValid,
              fairnessScore: generateResult.fairnessScore,
              employeeSummaries: generateResult.employeeSummaries,
              assignments: generateResult.assignments,
            },
          },
          3
        );

  perf.setStat('planActionCount', actions.length);

  const perfSnapshot = perf.finalize();
  perf.log('[schedule/v3/solve]');

  const payload: Record<string, unknown> = {
    weekStart: generateResult.weekStart,
    mode: generateResult.mode,
    policy,
    qualityPercents,
    smartRecommendations,
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
      solverStatus: generateResult.solverStatus,
      stoppedReason: generateResult.stoppedReason,
      iterationsByDay: generateResult.iterationsByDay,
      iterationsByScenario: generateResult.iterationsByScenario,
    },
    actions: slimActions(actions),
    dayOperatingConfigs,
    metrics,
    guestShiftCount: guestShifts.length,
    scenariosTried: generateResult.scenariosTried,
  };

  if (isSchedulePerfResponseEnabled()) {
    payload.timings = perfSnapshot.timings;
    payload.stats = perfSnapshot.stats;
  }

  return { payload };
}

function migrationHint(message: string): string {
  if (message.includes('ShiftOverrideSegment') || message.includes('does not exist')) {
    return ' Database migration may be pending — run: npx prisma migrate deploy';
  }
  return '';
}

/** Stream newlines while solving so nginx proxy_read_timeout resets (60s default). */
function streamSolveResponse(
  weekStart: string,
  boutiqueIds: string[],
  solveOptions?: { preAnalyzed?: boolean; forcePartialSolve?: boolean }
): Response {
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
        const { payload } = await computeSolvePayload(weekStart, boutiqueIds, solveOptions);
        const serializeStarted = performance.now();
        let body: string;
        if (isSchedulePerfResponseEnabled() && payload.timings && typeof payload.timings === 'object') {
          JSON.stringify(payload);
          const serializationMs = performance.now() - serializeStarted;
          body = JSON.stringify({
            ...payload,
            timings: {
              ...(payload.timings as Record<string, number>),
              responseSerializationMs: serializationMs,
            },
          });
        } else {
          body = JSON.stringify(payload);
          if (shouldLogSchedulePerf()) {
            console.log(
              `[schedule/v3/solve] Response serialization ....... ${(performance.now() - serializeStarted).toFixed(1)} ms`
            );
          }
        }
        if (shouldLogSchedulePerf() && isSchedulePerfResponseEnabled()) {
          const parsed = JSON.parse(body) as { timings?: { responseSerializationMs?: number } };
          console.log(
            `[schedule/v3/solve] Response serialization ....... ${(parsed.timings?.responseSerializationMs ?? 0).toFixed(1)} ms`
          );
        }
        controller.enqueue(encoder.encode(body));
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

  let body: { weekStart?: string; preAnalyzed?: boolean; forcePartialSolve?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const preAnalyzed = body.preAnalyzed === true;
  const forcePartialSolve = body.forcePartialSolve === true;

  return streamSolveResponse(weekStart, scheduleScope.boutiqueIds, {
    preAnalyzed,
    forcePartialSolve,
  });
}
