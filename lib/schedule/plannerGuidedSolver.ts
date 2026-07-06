/**
 * Planner-Guided Solver — executes Resource Planner daily target patterns before
 * the iterative fallback solver in Schedule Engine v3.
 *
 * Daily patterns:
 *   NORMAL            — assign targetAm AM + targetPm PM (disjoint employees)
 *   SHORTAGE_3_STAFF  — 1 AM + 1 PM + 1 BRIDGE when 3 staff must cover AM≥2 PM≥2
 *   FRIDAY_PM_ONLY    — 2 PM employees only
 *
 * Bridge segments (normal week): 09:30–14:30 + 17:30–22:30 = 10h, counts AM+PM,
 * compensation owed +2h per bridge day.
 */

import {
  mergeAdjacentSegments,
  parseTimeToMinutes,
  segmentFromPeriodEnd,
  segmentFromPeriodStart,
} from '@/lib/schedule/generateSchedule/timeSlots';
import { segmentsAmPmContribution } from '@/lib/schedule/segmentCoverage';
import {
  buildDailyTargetPlans,
  BRIDGE_COMPENSATION_HOURS,
  type DailyTargetPlan,
} from '@/lib/schedule/resourcePlanner';
import type {
  DaySlotBundle,
  EmployeeCandidate,
  GenerateScheduleInput,
  OperatingPeriod,
  ShiftSegment,
  WorkingDayShift,
} from '@/lib/schedule/generateSchedule/types';

export const BRIDGE_AM_START = '09:30';
export const BRIDGE_AM_END = '14:30';
export const BRIDGE_PM_START = '17:30';
export const BRIDGE_PM_END = '22:30';
export const BRIDGE_TOTAL_HOURS = 10;

type DayState = Map<string, WorkingDayShift>;

function unavailKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

function isEmployeeAvailable(
  emp: EmployeeCandidate,
  date: string,
  dayOfWeek: number,
  weeklyOff: Map<string, number>,
  unavail: Map<string, string>
): boolean {
  const kind = unavail.get(unavailKey(emp.empId, date));
  if (kind === 'leave' || kind === 'holiday' || kind === 'absent' || kind === 'weekly_off') {
    return false;
  }
  const offDow = weeklyOff.get(emp.empId);
  if (offDow !== undefined && dayOfWeek === offDow) return false;
  if (emp.weeklyOffDay !== 'NONE' && emp.weeklyOffDay === dayOfWeek && offDow === undefined) {
    return false;
  }
  return true;
}

function bridgeSegments(periodIndex = 0): ShiftSegment[] {
  return [
    { periodIndex, startTime: BRIDGE_AM_START, endTime: BRIDGE_AM_END },
    { periodIndex, startTime: BRIDGE_PM_START, endTime: BRIDGE_PM_END },
  ];
}

function amSegments(periodIndex = 0): ShiftSegment[] {
  return [{ periodIndex, startTime: BRIDGE_AM_START, endTime: BRIDGE_AM_END }];
}

function pmSegments(periodIndex = 0): ShiftSegment[] {
  return [{ periodIndex, startTime: BRIDGE_PM_START, endTime: BRIDGE_PM_END }];
}

/** True when segments are the canonical bridge pattern (AM opening + PM closing). */
export function isBridgeShiftSegments(segments: ShiftSegment[]): boolean {
  if (segments.length !== 2) return false;
  const sorted = [...segments].sort(
    (a, b) => a.periodIndex - b.periodIndex || parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );
  if (sorted[0].periodIndex === 0 && sorted[1].periodIndex === 1) {
    return sorted[0].startTime === BRIDGE_AM_START && sorted[1].endTime === BRIDGE_PM_END;
  }
  return (
    sorted[0].startTime === BRIDGE_AM_START &&
    sorted[0].endTime === BRIDGE_AM_END &&
    sorted[1].startTime === BRIDGE_PM_START &&
    sorted[1].endTime === BRIDGE_PM_END
  );
}

function fridayPmSegments(period: OperatingPeriod, periodIndex: number): ShiftSegment[] {
  return [segmentFromPeriodEnd(period, periodIndex, 8)];
}

function normalAmPmSegments(
  periods: GenerateScheduleInput['days'][0]['operatingPeriods'],
  role: 'AM' | 'PM' | 'BRIDGE'
): ShiftSegment[] {
  if (periods.length < 2) {
    if (role === 'AM') return amSegments(0);
    if (role === 'PM') return pmSegments(0);
    return bridgeSegments(0);
  }
  if (role === 'AM') return [segmentFromPeriodStart(periods[0], 0, 8)];
  if (role === 'PM') return [segmentFromPeriodEnd(periods[1], 1, 8)];
  return [
    segmentFromPeriodStart(periods[0], 0, 5),
    segmentFromPeriodEnd(periods[1], 1, 5),
  ];
}

function upsertShift(
  state: DayState,
  emp: EmployeeCandidate,
  date: string,
  segments: ShiftSegment[],
  reason: string
): void {
  const key = unavailKey(emp.empId, date);
  state.set(key, {
    empId: emp.empId,
    name: emp.name,
    date,
    isExternalSupport: emp.isExternalSupport,
    segments: mergeAdjacentSegments(segments),
    reasons: [reason],
  });
}

function pickBridgeEmployee(
  pool: EmployeeCandidate[],
  bridgeCounts: Map<string, number>,
  exclude: Set<string>,
  dayIndex: number,
  rotationOffset = 0
): EmployeeCandidate | null {
  const candidates = pool
    .filter((e) => !exclude.has(e.empId))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (candidates.length === 0) return null;

  const minCount = Math.min(...candidates.map((c) => bridgeCounts.get(c.empId) ?? 0));
  const tied = candidates.filter((c) => (bridgeCounts.get(c.empId) ?? 0) === minCount);
  return tied[(dayIndex + rotationOffset) % tied.length] ?? tied[0];
}

function assignDayFromPlan(
  input: GenerateScheduleInput,
  bundle: DaySlotBundle,
  plan: DailyTargetPlan,
  weeklyOff: Map<string, number>,
  unavail: Map<string, string>,
  state: DayState,
  bridgeCounts: Map<string, number>,
  dayIndex: number,
  bridgeRotationOffset = 0
): void {
  const day = input.days.find((d) => d.date === plan.date);
  if (!day) return;

  const pool = input.regularEmployees.filter((emp) =>
    isEmployeeAvailable(emp, day.date, day.dayOfWeek, weeklyOff, unavail)
  );
  if (pool.length === 0) return;

  const period = day.operatingPeriods[0];
  const periodIdx = 0;
  const isFridayPmOnly = plan.pattern === 'FRIDAY_PM_ONLY';

  if (isFridayPmOnly && period) {
    const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    sorted.slice(0, plan.targetPm).forEach((emp) => {
      upsertShift(
        state,
        emp,
        day.date,
        fridayPmSegments(period, periodIdx),
        'Planner-guided: Friday PM'
      );
    });
    return;
  }

  if (day.operatingPeriods.length >= 2) {
    if (plan.pattern === 'SHORTAGE_3_STAFF' && pool.length >= 3) {
      const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name));
      const bridgeEmp = pickBridgeEmployee(sorted, bridgeCounts, new Set(), dayIndex, bridgeRotationOffset);
      if (!bridgeEmp) return;
      const rest = sorted.filter((e) => e.empId !== bridgeEmp.empId);
      const amEmp = rest[0];
      const pmEmp = rest[1];
      if (!amEmp || !pmEmp) return;
      upsertShift(state, amEmp, day.date, normalAmPmSegments(day.operatingPeriods, 'AM'), 'Planner-guided: AM');
      upsertShift(state, pmEmp, day.date, normalAmPmSegments(day.operatingPeriods, 'PM'), 'Planner-guided: PM');
      upsertShift(
        state,
        bridgeEmp,
        day.date,
        normalAmPmSegments(day.operatingPeriods, 'BRIDGE'),
        'Planner-guided: Bridge'
      );
      bridgeCounts.set(bridgeEmp.empId, (bridgeCounts.get(bridgeEmp.empId) ?? 0) + 1);
      return;
    }
    const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    const amStaff = sorted.slice(0, plan.targetAm);
    const pmStaff = sorted.slice(plan.targetAm, plan.targetAm + plan.targetPm);
    amStaff.forEach((emp) =>
      upsertShift(state, emp, day.date, normalAmPmSegments(day.operatingPeriods, 'AM'), 'Planner-guided: AM')
    );
    pmStaff.forEach((emp) =>
      upsertShift(state, emp, day.date, normalAmPmSegments(day.operatingPeriods, 'PM'), 'Planner-guided: PM')
    );
    return;
  }

  if (plan.pattern === 'SHORTAGE_3_STAFF' && pool.length >= 3) {
    const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    const bridgeEmp = pickBridgeEmployee(sorted, bridgeCounts, new Set(), dayIndex, bridgeRotationOffset);
    if (!bridgeEmp) return;
    const rest = sorted.filter((e) => e.empId !== bridgeEmp.empId);
    const amEmp = rest[0];
    const pmEmp = rest[1];
    if (!amEmp || !pmEmp) return;
    upsertShift(state, amEmp, day.date, amSegments(periodIdx), 'Planner-guided: AM');
    upsertShift(state, pmEmp, day.date, pmSegments(periodIdx), 'Planner-guided: PM');
    upsertShift(state, bridgeEmp, day.date, bridgeSegments(periodIdx), 'Planner-guided: Bridge');
    bridgeCounts.set(bridgeEmp.empId, (bridgeCounts.get(bridgeEmp.empId) ?? 0) + 1);
    return;
  }

  // NORMAL — disjoint AM + PM sets, minimize bridge.
  const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name));
  const amStaff = sorted.slice(0, plan.targetAm);
  const pmStaff = sorted.slice(plan.targetAm, plan.targetAm + plan.targetPm);
  amStaff.forEach((emp) =>
    upsertShift(state, emp, day.date, amSegments(periodIdx), 'Planner-guided: AM')
  );
  pmStaff.forEach((emp) =>
    upsertShift(state, emp, day.date, pmSegments(periodIdx), 'Planner-guided: PM')
  );
}

/**
 * Build a week schedule state from Resource Planner daily target patterns.
 * Returns null when planner cannot produce any assignment (caller falls back).
 */
export function applyPlannerGuidedSolve(
  input: GenerateScheduleInput,
  bundles: DaySlotBundle[],
  weeklyOff: Map<string, number>,
  unavail: Map<string, string>,
  options?: { bridgeRotationOffset?: number }
): DayState {
  const bridgeRotationOffset = options?.bridgeRotationOffset ?? 0;
  const plans = buildDailyTargetPlans(input, unavail, weeklyOff);
  const state: DayState = new Map();
  const bridgeCounts = new Map<string, number>();
  input.regularEmployees.forEach((e) => bridgeCounts.set(e.empId, 0));
  let bridgeDayCounter = 0;

  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const bundle = bundles.find((b) => b.date === plan.date);
    if (!bundle) continue;
    const usesBridge = plan.pattern === 'SHORTAGE_3_STAFF' && plan.availableEmployees >= 3;
    assignDayFromPlan(
      input,
      bundle,
      plan,
      weeklyOff,
      unavail,
      state,
      bridgeCounts,
      usesBridge ? bridgeDayCounter++ : 0,
      bridgeRotationOffset
    );
  }

  return state;
}

/** Count AM/PM coverage for a day from working shifts (for tests and UI). */
export function countAmPmForDay(
  dayShifts: WorkingDayShift[],
  periods: GenerateScheduleInput['days'][0]['operatingPeriods'],
  dayOfWeek: number,
  isRamadan: boolean
): { am: number; pm: number; bridge: number } {
  let am = 0;
  let pm = 0;
  let bridge = 0;
  dayShifts.forEach((s) => {
    if (!s.segments.length) return;
    if (isBridgeShiftSegments(s.segments)) {
      bridge += 1;
      am += 1;
      pm += 1;
      return;
    }
    const contrib = segmentsAmPmContribution(s.segments, periods, dayOfWeek, isRamadan);
    if (contrib.am) am += 1;
    if (contrib.pm) pm += 1;
  });
  return { am, pm, bridge };
}

export { BRIDGE_COMPENSATION_HOURS };
