/**
 * Dynamic schedule generation engine — operating periods, time slots, fairness.
 */

import type {
  DaySlotBundle,
  EmployeeCandidate,
  EmployeeDayAssignment,
  GenerateScheduleInput,
  GenerateScheduleResult,
  GridShiftProposal,
  OperatingPeriod,
  ShiftSegment,
  StoppedReason,
  SolverStatus,
  TimeSlot,
  Unavailability,
  WorkingDayShift,
} from './types';
import { buildDaySlotBundles } from './timeSlots';
import {
  calculateCoverageForSlot,
  dayTotalHours,
  extendShiftToCoverSlot,
  mergeAdjacentSegments,
  segmentFromPeriodStart,
  validateCoverage,
} from './timeSlots';
import { weekModeFromDays } from './operatingPeriods';
import {
  buildEmployeeSummaries,
  buildFullWeekAssignments,
  calculateFairnessScore,
  countEmployeeWeeklySplitDays,
} from './fairness';
import { shiftToSegmentsForCounting } from '@/lib/schedule/segmentCoverage';
import { assignmentsToGridProposals } from './toPlanActions';
import type { ScheduleEnginePerfCollector } from '@/lib/schedule/scheduleEnginePerf';
import { applyPlannerGuidedSolve } from '@/lib/schedule/plannerGuidedSolver';
import {
  MAX_ITERATIONS_PER_DAY,
  MAX_SCENARIOS,
  MAX_SOLVE_MS,
  MAX_TOTAL_ITERATIONS,
} from './solverLimits';

export type GenerateScheduleOptions = {
  perf?: ScheduleEnginePerfCollector;
  /** Health check completed before solve (API metadata). */
  preAnalyzed?: boolean;
  /** Run fill passes even when staffing headcount precheck fails (best-effort partial). */
  forcePartialSolve?: boolean;
};

type DayState = Map<string, WorkingDayShift>;

type SolverContext = {
  solveStartedAt: number;
  totalIterations: number;
  stoppedReason: StoppedReason | null;
  iterationsByDay: Record<string, number>;
  iterationsByScenario: number[];
  scenarioIndex: number;
};

function createSolverContext(): SolverContext {
  return {
    solveStartedAt: performance.now(),
    totalIterations: 0,
    stoppedReason: null,
    iterationsByDay: {},
    iterationsByScenario: [],
    scenarioIndex: 0,
  };
}

function variantKey(v: Map<string, number>): string {
  return Array.from(v.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .join('|');
}

function unavailKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

function buildUnavailMap(unavailability: Unavailability[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of unavailability) {
    map.set(unavailKey(u.empId, u.date), u.kind);
  }
  return map;
}

function maxDailyHoursForDay(isRamadan: boolean, input: GenerateScheduleInput): number {
  return isRamadan ? input.settings.ramadanMode.maxDailyHours : input.settings.normalMode.maxDailyHours;
}

function gridShiftToSegments(
  shift: string,
  periods: OperatingPeriod[],
  maxHours: number
): ShiftSegment[] {
  return shiftToSegmentsForCounting(shift, periods, maxHours);
}

function isEmployeeAvailable(
  emp: EmployeeCandidate,
  date: string,
  dayOfWeek: number,
  weeklyOffOverride: Map<string, number>,
  unavail: Map<string, string>
): boolean {
  const key = unavailKey(emp.empId, date);
  const kind = unavail.get(key);
  if (kind === 'leave' || kind === 'holiday' || kind === 'absent') return false;
  if (kind === 'weekly_off') return false;
  const offDow = weeklyOffOverride.get(emp.empId);
  if (offDow !== undefined && dayOfWeek === offDow) return false;
  if (emp.weeklyOffDay !== 'NONE' && emp.weeklyOffDay === dayOfWeek && offDow === undefined) {
    return false;
  }
  return true;
}

function getDayShifts(state: DayState, date: string): WorkingDayShift[] {
  return Array.from(state.values()).filter((s) => s.date === date);
}

function countSplitDays(state: DayState): Map<string, number> {
  const counts = new Map<string, number>();
  Array.from(state.values()).forEach((shift) => {
    const indexes = new Set(shift.segments.map((seg) => seg.periodIndex));
    if (indexes.size >= 2) {
      counts.set(shift.empId, (counts.get(shift.empId) ?? 0) + 1);
    }
  });
  return counts;
}

function weeklyHours(state: DayState, empId: string): number {
  let total = 0;
  Array.from(state.values()).forEach((s) => {
    if (s.empId === empId) total += dayTotalHours(s.segments);
  });
  return total;
}

function upsertShift(
  state: DayState,
  emp: EmployeeCandidate,
  date: string,
  segments: ShiftSegment[],
  reason: string
): void {
  const key = unavailKey(emp.empId, date);
  const existing = state.get(key);
  if (existing) {
    existing.segments = mergeAdjacentSegments(segments);
    if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
  } else {
    state.set(key, {
      empId: emp.empId,
      name: emp.name,
      date,
      isExternalSupport: emp.isExternalSupport,
      segments: mergeAdjacentSegments(segments),
      reasons: [reason],
    });
  }
}

function activePeriodIndices(bundle: DaySlotBundle, dayShifts: WorkingDayShift[]): Set<number> {
  const active = new Set<number>();
  for (const slot of bundle.slots) {
    if (calculateCoverageForSlot(dayShifts, slot) < slot.minCoverage) {
      active.add(slot.periodIndex);
    }
  }
  return active;
}

function worstUncoveredSlotInPeriods(
  bundle: DaySlotBundle,
  dayShifts: WorkingDayShift[],
  periodIndices: Set<number>
): { slot: TimeSlot; deficit: number } | null {
  let worst: { slot: TimeSlot; deficit: number; coverage: number } | null = null;
  for (const slot of bundle.slots) {
    if (!periodIndices.has(slot.periodIndex)) continue;
    const coverage = calculateCoverageForSlot(dayShifts, slot);
    const deficit = slot.minCoverage - coverage;
    if (deficit <= 0) continue;
    if (!worst || deficit > worst.deficit || (deficit === worst.deficit && coverage < worst.coverage)) {
      worst = { slot, deficit, coverage };
    }
  }
  return worst ? { slot: worst.slot, deficit: worst.deficit } : null;
}

function computeFillSignature(
  date: string,
  bundle: DaySlotBundle,
  dayShifts: WorkingDayShift[]
): string {
  let uncoveredCount = 0;
  let coverageSum = 0;
  for (const slot of bundle.slots) {
    const coverage = calculateCoverageForSlot(dayShifts, slot);
    coverageSum += coverage;
    if (coverage < slot.minCoverage) uncoveredCount++;
  }
  return `${date}|${uncoveredCount}|${coverageSum}|${dayShifts.length}`;
}

function isStaffingImpossible(
  input: GenerateScheduleInput,
  bundles: DaySlotBundle[],
  weeklyOff: Map<string, number>,
  unavail: Map<string, string>
): boolean {
  const allEmployees = [...input.regularEmployees, ...input.externalSupportEmployees];
  for (const bundle of bundles) {
    let available = 0;
    for (const emp of allEmployees) {
      if (isEmployeeAvailable(emp, bundle.date, bundle.dayOfWeek, weeklyOff, unavail)) {
        available++;
      }
    }
    const peakMin = bundle.slots.reduce((max, slot) => Math.max(max, slot.minCoverage), 0);
    if (available < peakMin) return true;
  }
  return false;
}

function budgetExceeded(ctx: SolverContext): boolean {
  if (performance.now() - ctx.solveStartedAt >= MAX_SOLVE_MS) {
    ctx.stoppedReason = 'SOLVE_TIMEOUT';
    return true;
  }
  if (ctx.totalIterations >= MAX_TOTAL_ITERATIONS) {
    ctx.stoppedReason = 'MAX_ITERATIONS';
    return true;
  }
  return false;
}

function recordIteration(ctx: SolverContext, date: string, perf?: ScheduleEnginePerfCollector): void {
  ctx.totalIterations++;
  ctx.iterationsByDay[date] = (ctx.iterationsByDay[date] ?? 0) + 1;
  perf?.addStat('constraintIterations', 1);
}

function pickEmployeeForSlot(
  candidates: EmployeeCandidate[],
  slot: TimeSlot,
  bundle: DaySlotBundle,
  state: DayState,
  weeklyOff: Map<string, number>,
  unavail: Map<string, string>,
  maxDaily: number,
  splitCounts: Map<string, number>,
  maxSplit: number,
  allowSplit: boolean,
  allowOvertime: boolean,
  historicalLoad: Map<string, number>
): { emp: EmployeeCandidate; segments: ShiftSegment[]; reason: string } | null {
  const period = bundle.operatingPeriods[slot.periodIndex];
  if (!period) return null;

  type Scored = {
    emp: EmployeeCandidate;
    segments: ShiftSegment[];
    reason: string;
    score: number;
  };
  const scored: Scored[] = [];

  for (const emp of candidates) {
    if (!isEmployeeAvailable(emp, bundle.date, bundle.dayOfWeek, weeklyOff, unavail)) continue;

    const key = unavailKey(emp.empId, bundle.date);
    const existing = state.get(key);
    const currentSegments = existing?.segments ?? [];

    const extended = extendShiftToCoverSlot(currentSegments, slot, period, maxDaily, allowOvertime);
    if (extended) {
      const indexes = new Set(extended.map((s) => s.periodIndex));
      const wouldSplit = indexes.size >= 2;
      if (wouldSplit && !allowSplit) continue;
      if (wouldSplit && (splitCounts.get(emp.empId) ?? 0) >= maxSplit) continue;

      const hours = dayTotalHours(extended);
      if (hours > maxDaily && !allowOvertime) continue;

      const hist = historicalLoad.get(emp.empId) ?? 0;
      const weekH = weeklyHours(state, emp.empId);
      let score = weekH * 2 + hist * 0.3;
      if (wouldSplit) score += 50 + (splitCounts.get(emp.empId) ?? 0) * 10;
      if (hours > maxDaily) score += 100;
      scored.push({
        emp,
        segments: extended,
        reason: wouldSplit ? 'Split shift to cover slot deficit' : 'Assigned to meet time-slot coverage',
        score,
      });
      continue;
    }

    if (!allowSplit || (splitCounts.get(emp.empId) ?? 0) >= maxSplit) continue;

    const otherPeriodIdx = bundle.operatingPeriods.findIndex((_, i) => i !== slot.periodIndex);
    if (otherPeriodIdx < 0) continue;

    const otherPeriod = bundle.operatingPeriods[otherPeriodIdx];
    const otherSeg = segmentFromPeriodStart(otherPeriod, otherPeriodIdx, maxDaily / 2);
    const slotSeg = extendShiftToCoverSlot([], slot, period, maxDaily / 2, allowOvertime);
    if (!slotSeg) continue;
    const combined = mergeAdjacentSegments([...slotSeg, otherSeg]);
    if (dayTotalHours(combined) > maxDaily && !allowOvertime) continue;

    const hist = historicalLoad.get(emp.empId) ?? 0;
    scored.push({
      emp,
      segments: combined,
      reason: 'Split shift across operating periods for coverage',
      score: 200 + weeklyHours(state, emp.empId) * 2 + hist * 0.3,
    });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored[0] ?? null;
}

function preserveExistingForDay(
  input: GenerateScheduleInput,
  state: DayState,
  day: GenerateScheduleInput['days'][number],
  weeklyOffOverrides: Map<string, number>,
  unavail: Map<string, string>,
  allEmployees: EmployeeCandidate[]
): void {
  const maxDaily = maxDailyHoursForDay(day.isRamadan, input);

  for (const emp of allEmployees) {
    if (!isEmployeeAvailable(emp, day.date, day.dayOfWeek, weeklyOffOverrides, unavail)) continue;

    if (input.preserveExisting) {
      const current = input.currentShifts?.find((s) => s.empId === emp.empId && s.date === day.date);
      if (current && current.availability === 'WORK' && current.shift !== 'NONE') {
        const segments = gridShiftToSegments(current.shift, day.operatingPeriods, maxDaily);
        if (segments.length) {
          upsertShift(state, emp, day.date, segments, 'Preserved from current schedule');
        }
      }
    }
  }
}

function buildPreservedState(
  input: GenerateScheduleInput,
  weeklyOffOverrides: Map<string, number>,
  unavail: Map<string, string>
): DayState {
  const state: DayState = new Map();
  const allEmployees = [...input.regularEmployees, ...input.externalSupportEmployees];
  for (const day of input.days) {
    preserveExistingForDay(input, state, day, weeklyOffOverrides, unavail, allEmployees);
  }
  return state;
}

function validateState(
  bundles: DaySlotBundle[],
  state: DayState,
  perf?: ScheduleEnginePerfCollector
): ReturnType<typeof validateCoverage>['violations'] {
  const byDate = new Map<string, WorkingDayShift[]>();
  Array.from(state.values()).forEach((shift) => {
    const list = byDate.get(shift.date) ?? [];
    list.push(shift);
    byDate.set(shift.date, list);
  });
  const validationStarted = performance.now();
  const { violations } = validateCoverage(bundles, byDate);
  perf?.mark('coverageValidationMs', performance.now() - validationStarted);
  return violations;
}

function solveScenario(
  input: GenerateScheduleInput,
  bundles: DaySlotBundle[],
  weeklyOffOverrides: Map<string, number>,
  unavail: Map<string, string>,
  ctx: SolverContext,
  perf?: ScheduleEnginePerfCollector
): { state: DayState; violations: ReturnType<typeof validateCoverage>['violations'] } {
  const solveStarted = performance.now();
  // Start from Resource Planner daily target patterns; fallback fill runs on gaps only.
  const state: DayState = applyPlannerGuidedSolve(input, bundles, weeklyOffOverrides, unavail);
  const allEmployees = [...input.regularEmployees, ...input.externalSupportEmployees];
  const historicalLoad = new Map(input.historicalStats.map((h) => [h.empId, h.priorWeekHours]));

  for (const day of input.days) {
    if (budgetExceeded(ctx)) break;

    const bundle = bundles.find((b) => b.date === day.date);
    if (!bundle || bundle.slots.length === 0) continue;

    const maxDaily = maxDailyHoursForDay(day.isRamadan, input);
    preserveExistingForDay(input, state, day, weeklyOffOverrides, unavail, allEmployees);

    let dayIterations = 0;
    const progressSeen = new Set<string>();

    const fillPass = (
      allowExternal: boolean,
      allowSplit: boolean,
      allowOvertime: boolean,
      reasonPrefix: string
    ) => {
      let activePeriods = activePeriodIndices(bundle, getDayShifts(state, day.date));

      while (dayIterations < MAX_ITERATIONS_PER_DAY) {
        if (budgetExceeded(ctx)) return;

        const dayShifts = getDayShifts(state, day.date);
        if (!activePeriods.size) {
          activePeriods = activePeriodIndices(bundle, dayShifts);
        }
        if (!activePeriods.size) break;

        const worst = worstUncoveredSlotInPeriods(bundle, dayShifts, activePeriods);
        if (!worst) {
          activePeriods.clear();
          continue;
        }

        const signature = computeFillSignature(day.date, bundle, dayShifts);
        if (progressSeen.has(signature)) {
          ctx.stoppedReason = 'NO_PROGRESS';
          return;
        }
        progressSeen.add(signature);

        recordIteration(ctx, day.date, perf);
        dayIterations++;

        const pool = allowExternal
          ? allEmployees
          : input.regularEmployees.filter((e) => !e.isExternalSupport);

        const pick = pickEmployeeForSlot(
          pool,
          worst.slot,
          bundle,
          state,
          weeklyOffOverrides,
          unavail,
          maxDaily,
          countSplitDays(state),
          input.settings.maxSplitDaysPerEmployeePerWeek,
          allowSplit && input.settings.splitShiftAllowed,
          allowOvertime,
          historicalLoad
        );

        if (!pick) break;

        upsertShift(state, pick.emp, day.date, pick.segments, `${reasonPrefix}: ${pick.reason}`);
        activePeriods = activePeriodIndices(bundle, getDayShifts(state, day.date));
      }

      if (dayIterations >= MAX_ITERATIONS_PER_DAY && activePeriodIndices(bundle, getDayShifts(state, day.date)).size) {
        ctx.stoppedReason = 'MAX_ITERATIONS_PER_DAY';
      }
    };

    fillPass(false, false, false, 'Regular coverage');
    if (budgetExceeded(ctx)) break;
    fillPass(false, true, false, 'Split coverage');
    if (budgetExceeded(ctx)) break;
    if (input.settings.externalSupportEmployeesAllowed) {
      fillPass(true, false, false, 'External support');
      if (budgetExceeded(ctx)) break;
      fillPass(true, true, false, 'External + split');
      if (budgetExceeded(ctx)) break;
    }
    fillPass(true, true, true, 'Overtime');
  }

  perf?.mark('solveConstraintsMs', performance.now() - solveStarted);
  const violations = validateState(bundles, state, perf);
  return { state, violations };
}

function generateWeeklyOffVariants(input: GenerateScheduleInput, maxVariants: number): Map<string, number>[] {
  const base = new Map<string, number>();
  for (const emp of input.regularEmployees) {
    if (emp.weeklyOffDay !== 'NONE') base.set(emp.empId, emp.weeklyOffDay);
  }

  const variants: Map<string, number>[] = [new Map(base)];
  const seen = new Set<string>([variantKey(base)]);

  const dowSet = new Set(input.days.map((d) => d.dayOfWeek));
  const dows = Array.from(dowSet).sort((a, b) => a - b);

  for (const emp of input.regularEmployees) {
    if (variants.length >= maxVariants) break;

    const current = base.get(emp.empId);
    const altDows = dows.filter((dow) => dow !== current);
    if (altDows.length === 0) continue;

    const variant = new Map(base);
    variant.set(emp.empId, altDows[0]);
    const key = variantKey(variant);
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(variant);
  }

  return variants.slice(0, maxVariants);
}

function applyWeeklyOffToUnavail(
  input: GenerateScheduleInput,
  weeklyOff: Map<string, number>,
  baseUnavail: Map<string, string>
): Map<string, string> {
  const unavail = new Map(baseUnavail);
  for (const day of input.days) {
    for (const emp of input.regularEmployees) {
      const offDow = weeklyOff.get(emp.empId);
      if (offDow !== undefined && day.dayOfWeek === offDow) {
        unavail.set(unavailKey(emp.empId, day.date), 'weekly_off');
      }
    }
  }
  return unavail;
}

function buildWarnings(
  violations: GenerateScheduleResult['slotViolations'],
  assignments: EmployeeDayAssignment[],
  solverStatus: SolverStatus
): string[] {
  const warnings: string[] = [];
  if (solverStatus === 'IMPOSSIBLE') {
    warnings.push('Staffing is insufficient to meet minimum coverage on at least one day.');
  } else if (solverStatus === 'PARTIAL_TIMEOUT') {
    warnings.push('Solver stopped early due to time limit; coverage may be incomplete.');
  } else if (solverStatus === 'PARTIAL_ITERATION_LIMIT') {
    warnings.push('Solver stopped early due to iteration limit; coverage may be incomplete.');
  }
  if (violations.length) {
    const byDate = new Map<string, number>();
    for (const v of violations) {
      byDate.set(v.date, (byDate.get(v.date) ?? 0) + 1);
    }
    Array.from(byDate.entries()).forEach(([date, count]) => {
      warnings.push(`Coverage below minimum on ${date} (${count} slot(s) under minCoverage)`);
    });
  }
  for (const a of assignments) {
    if (a.reasons.some((r) => r.includes('Overtime'))) {
      warnings.push(`Overtime used for ${a.name} on ${a.date}`);
    }
  }
  return warnings;
}

function resolveSolverStatus(
  violationCount: number,
  ctx: SolverContext,
  allScenariosImpossible: boolean
): SolverStatus {
  if (allScenariosImpossible) return 'IMPOSSIBLE';
  if (violationCount === 0) {
    if (ctx.stoppedReason === 'SOLVE_TIMEOUT') return 'PARTIAL_TIMEOUT';
    return 'COMPLETE';
  }
  if (ctx.stoppedReason === 'SOLVE_TIMEOUT') return 'PARTIAL_TIMEOUT';
  if (
    ctx.stoppedReason === 'IMPOSSIBLE_STAFFING' ||
    ctx.stoppedReason === 'NO_PROGRESS'
  ) {
    return 'IMPOSSIBLE';
  }
  return 'PARTIAL_ITERATION_LIMIT';
}

/** Main entry: try multiple weekly-off scenarios and pick lowest fairness score with best coverage. */
export function generateSchedule(
  input: GenerateScheduleInput,
  options?: GenerateScheduleOptions
): GenerateScheduleResult {
  const perf = options?.perf;
  const generateStarted = performance.now();
  const ctx = createSolverContext();

  const bundles = perf
    ? perf.timeSync('buildTimeSlotsMs', () =>
        buildDaySlotBundles(input.days, input.settings.slotIntervalMinutes)
      )
    : buildDaySlotBundles(input.days, input.settings.slotIntervalMinutes);

  if (perf) {
    perf.setStat('timeSlotsGenerated', bundles.reduce((sum, b) => sum + b.slots.length, 0));
    perf.setStat('dayCount', input.days.length);
    perf.setStat('employeeCount', input.regularEmployees.length);
    perf.setStat('externalSupportCount', input.externalSupportEmployees.length);
  }

  const baseUnavail = buildUnavailMap(input.unavailability);
  const variants = perf
    ? perf.timeSync('generateCandidatesMs', () => generateWeeklyOffVariants(input, MAX_SCENARIOS))
    : generateWeeklyOffVariants(input, MAX_SCENARIOS);

  if (perf) {
    perf.setStat('weeklyOffVariants', variants.length);
  }

  let best: {
    assignments: EmployeeDayAssignment[];
    violations: GenerateScheduleResult['slotViolations'];
    fairness: number;
    proposals: GridShiftProposal[];
  } | null = null;

  let scenariosTried = 0;
  let allScenariosImpossible = variants.length > 0;
  for (const weeklyOff of variants) {
    if (scenariosTried >= MAX_SCENARIOS || budgetExceeded(ctx)) {
      if (scenariosTried >= MAX_SCENARIOS) ctx.stoppedReason = 'MAX_SCENARIOS';
      break;
    }

    scenariosTried++;
    ctx.scenarioIndex = scenariosTried - 1;
    const scenarioStartIterations = ctx.totalIterations;

    const unavail = applyWeeklyOffToUnavail(input, weeklyOff, baseUnavail);

    let state: DayState;
    let violations: GenerateScheduleResult['slotViolations'];

    if (isStaffingImpossible(input, bundles, weeklyOff, unavail) && !options?.forcePartialSolve) {
      ctx.stoppedReason = 'IMPOSSIBLE_STAFFING';
      state = buildPreservedState(input, weeklyOff, unavail);
      violations = validateState(bundles, state, perf);
    } else {
      if (isStaffingImpossible(input, bundles, weeklyOff, unavail)) {
        ctx.stoppedReason = 'IMPOSSIBLE_STAFFING';
      }
      allScenariosImpossible = false;
      ({ state, violations } = solveScenario(input, bundles, weeklyOff, unavail, ctx, perf));
    }

    ctx.iterationsByScenario.push(ctx.totalIterations - scenarioStartIterations);

    const working = Array.from(state.values());
    const fairnessStarted = performance.now();
    const assignments = buildFullWeekAssignments(input, working, bundles, unavail);
    const fairnessBreakdown = calculateFairnessScore(assignments, input, violations.length);
    const proposals = assignmentsToGridProposals(assignments, bundles, input.currentShifts ?? []);
    perf?.mark('fairnessMs', performance.now() - fairnessStarted);

    const candidate = {
      assignments,
      violations,
      fairness: fairnessBreakdown.score,
      proposals,
    };

    if (
      !best ||
      violations.length < best.violations.length ||
      (violations.length === best.violations.length && fairnessBreakdown.score < best.fairness)
    ) {
      best = candidate;
    }

    if (violations.length === 0) {
      ctx.stoppedReason = 'COVERAGE_COMPLETE';
      break;
    }

    if (budgetExceeded(ctx)) break;
  }

  if (!ctx.stoppedReason && scenariosTried >= variants.length) {
    ctx.stoppedReason = 'VARIANTS_EXHAUSTED';
  }

  const result = best!;
  const mode = weekModeFromDays(input.days);
  const maxDaily = mode === 'ramadan'
    ? input.settings.ramadanMode.maxDailyHours
    : input.settings.normalMode.maxDailyHours;

  const summariesStarted = performance.now();
  const employeeSummaries = buildEmployeeSummaries(result.assignments, maxDaily);
  perf?.mark('fairnessMs', performance.now() - summariesStarted);

  const solverStatus = resolveSolverStatus(result.violations.length, ctx, allScenariosImpossible);

  perf?.mark('generateScheduleMs', performance.now() - generateStarted);
  if (perf) {
    perf.setStat('scenariosTried', scenariosTried);
    perf.setStat('assignmentCount', result.assignments.length);
    perf.setStat('slotViolations', result.violations.length);
    perf.setStat('solverStatus', solverStatus);
    perf.setStat('stoppedReason', ctx.stoppedReason);
    perf.setStat('iterationsByDay', { ...ctx.iterationsByDay });
    perf.setStat('iterationsByScenario', [...ctx.iterationsByScenario]);
  }

  return {
    weekStart: input.weekStart,
    mode,
    assignments: result.assignments,
    proposals: result.proposals,
    warnings: buildWarnings(result.violations, result.assignments, solverStatus),
    coverageValid: result.violations.length === 0,
    slotViolations: result.violations,
    fairnessScore: result.fairness,
    employeeSummaries,
    scenariosTried,
    solverStatus,
    stoppedReason: ctx.stoppedReason,
    iterationsByDay: { ...ctx.iterationsByDay },
    iterationsByScenario: [...ctx.iterationsByScenario],
  };
}

export { countEmployeeWeeklySplitDays, calculateFairnessScore };
