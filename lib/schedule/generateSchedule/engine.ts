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

type DayState = Map<string, WorkingDayShift>;

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

function uncoveredSlots(bundle: DaySlotBundle, dayShifts: WorkingDayShift[]) {
  return bundle.slots
    .map((slot) => ({
      slot,
      coverage: calculateCoverageForSlot(dayShifts, slot),
      deficit: slot.minCoverage - calculateCoverageForSlot(dayShifts, slot),
    }))
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit || a.coverage - b.coverage);
}

function pickEmployeeForSlot(
  candidates: EmployeeCandidate[],
  slot: import('./types').TimeSlot,
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

function solveScenario(
  input: GenerateScheduleInput,
  bundles: DaySlotBundle[],
  weeklyOffOverrides: Map<string, number>,
  unavail: Map<string, string>
): { state: DayState; violations: ReturnType<typeof validateCoverage>['violations'] } {
  const state: DayState = new Map();
  const allEmployees = [...input.regularEmployees, ...input.externalSupportEmployees];
  const historicalLoad = new Map(input.historicalStats.map((h) => [h.empId, h.priorWeekHours]));

  for (const day of input.days) {
    const bundle = bundles.find((b) => b.date === day.date);
    if (!bundle || bundle.slots.length === 0) continue;

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

    const fillPass = (
      allowExternal: boolean,
      allowSplit: boolean,
      allowOvertime: boolean,
      reasonPrefix: string
    ) => {
      let guard = 0;
      while (guard++ < 500) {
        const dayShifts = getDayShifts(state, day.date);
        const gaps = uncoveredSlots(bundle, dayShifts);
        if (!gaps.length) break;

        const { slot } = gaps[0];
        const pool = allowExternal
          ? allEmployees
          : input.regularEmployees.filter((e) => !e.isExternalSupport);

        const pick = pickEmployeeForSlot(
          pool,
          slot,
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
      }
    };

    fillPass(false, false, false, 'Regular coverage');
    fillPass(false, true, false, 'Split coverage');
    if (input.settings.externalSupportEmployeesAllowed) {
      fillPass(true, false, false, 'External support');
      fillPass(true, true, false, 'External + split');
    }
    fillPass(true, true, true, 'Overtime');
  }

  const byDate = new Map<string, WorkingDayShift[]>();
  Array.from(state.values()).forEach((shift) => {
    const list = byDate.get(shift.date) ?? [];
    list.push(shift);
    byDate.set(shift.date, list);
  });

  const { violations } = validateCoverage(bundles, byDate);
  return { state, violations };
}

function generateWeeklyOffVariants(input: GenerateScheduleInput): Map<string, number>[] {
  const variants: Map<string, number>[] = [];
  const base = new Map<string, number>();

  for (const emp of input.regularEmployees) {
    if (emp.weeklyOffDay !== 'NONE') base.set(emp.empId, emp.weeklyOffDay);
  }
  variants.push(new Map(base));

  const dowSet = new Set(input.days.map((d) => d.dayOfWeek));
  const dows = Array.from(dowSet).sort((a, b) => a - b);

  for (const emp of input.regularEmployees) {
    for (const dow of dows) {
      const variant = new Map(base);
      variant.set(emp.empId, dow);
      variants.push(variant);
    }
  }

  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = Array.from(v.entries())
      .sort()
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 24);
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
  assignments: EmployeeDayAssignment[]
): string[] {
  const warnings: string[] = [];
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

/** Main entry: try multiple weekly-off scenarios and pick lowest fairness score with best coverage. */
export function generateSchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const bundles = buildDaySlotBundles(input.days, input.settings.slotIntervalMinutes);
  const baseUnavail = buildUnavailMap(input.unavailability);
  const variants = generateWeeklyOffVariants(input);

  let best: {
    assignments: EmployeeDayAssignment[];
    violations: GenerateScheduleResult['slotViolations'];
    fairness: number;
    scenariosTried: number;
    proposals: GridShiftProposal[];
  } | null = null;

  let scenariosTried = 0;
  for (const weeklyOff of variants) {
    scenariosTried++;
    const unavail = applyWeeklyOffToUnavail(input, weeklyOff, baseUnavail);
    const { state, violations } = solveScenario(input, bundles, weeklyOff, unavail);
    const working = Array.from(state.values());
    const assignments = buildFullWeekAssignments(input, working, bundles, unavail);
    const fairnessBreakdown = calculateFairnessScore(assignments, input, violations.length);
    const proposals = assignmentsToGridProposals(assignments, bundles, input.currentShifts ?? []);

    const candidate = {
      assignments,
      violations,
      fairness: fairnessBreakdown.score,
      scenariosTried,
      proposals,
    };

    if (
      !best ||
      violations.length < best.violations.length ||
      (violations.length === best.violations.length && fairnessBreakdown.score < best.fairness)
    ) {
      best = candidate;
    }
  }

  const result = best!;
  const mode = weekModeFromDays(input.days);
  const maxDaily = mode === 'ramadan'
    ? input.settings.ramadanMode.maxDailyHours
    : input.settings.normalMode.maxDailyHours;

  return {
    weekStart: input.weekStart,
    mode,
    assignments: result.assignments,
    proposals: result.proposals,
    warnings: buildWarnings(result.violations, result.assignments),
    coverageValid: result.violations.length === 0,
    slotViolations: result.violations,
    fairnessScore: result.fairness,
    employeeSummaries: buildEmployeeSummaries(result.assignments, maxDaily),
    scenariosTried: result.scenariosTried,
  };
}

export { countEmployeeWeeklySplitDays, calculateFairnessScore };
