/**
 * Resource Planner — Workforce Planning Engine for Schedule Engine v3.
 *
 * Sits between Health Check and the Constraint Analyzer / Solver:
 *
 *   Health Check → Resource Planner → Constraint Analyzer → Solver → Apply
 *
 * The planner NEVER assigns shifts. It builds the week's workforce strategy
 * (resource budget, workload, bridge/overtime plan, compensation ledger) that the
 * existing solver then executes. It thinks like an operations manager:
 * "How do I distribute this week's workforce while minimizing fatigue?"
 */

import {
  parseTimeToMinutes,
  periodEndMinutes,
} from '@/lib/schedule/generateSchedule/timeSlots';
import { getSchedulePolicy, FRIDAY_DOW } from '@/lib/schedule/policyEngine';
import type {
  DayOperatingConfig,
  EmployeeCandidate,
  GenerateScheduleInput,
  HistoricalEmployeeStats,
  Unavailability,
} from '@/lib/schedule/generateSchedule/types';

/** Weekly ceiling used when planning resources (labour norm, not a solver rule). */
export const DEFAULT_WEEKLY_MAX_HOURS = 48;
/** Weekly overtime budget per employee (last-resort hours). */
export const DEFAULT_WEEKLY_OVERTIME_BUDGET = 8;
/** Extra hours in a bridge day count as compensation owed (long-day fatigue offset). */
export const BRIDGE_COMPENSATION_HOURS = 2;

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type ShiftAllocationType = 'AM' | 'PM' | 'SPLIT' | 'BRIDGE' | 'OVERTIME';

export type DailyTargetPattern = 'NORMAL' | 'SHORTAGE_3_STAFF' | 'FRIDAY_PM_ONLY';

export type DailyTargetPlan = {
  date: string;
  dayOfWeek: number;
  pattern: DailyTargetPattern;
  availableEmployees: number;
  targetAm: number;
  targetPm: number;
  targetBridge: number;
};

export type EmployeeResource = {
  employeeId: string;
  name: string;
  availableDays: number;
  weeklyLeaveDays: number;
  annualLeaveDays: number;
  publicHolidayDays: number;
  maxDailyHours: number;
  maxWeeklyHours: number;
  availableWeeklyHours: number;
  splitBudget: number;
  overtimeBudget: number;
  /** 0–100: how freely this employee can absorb extra load this week. */
  flexibilityScore: number;
};

export type DailyWorkload = {
  date: string;
  dayOfWeek: number;
  isRamadan: boolean;
  periodCount: number;
  requiredHours: number;
  availableHours: number;
  shortageHours: number;
  peakCoverage: number;
  availableEmployees: number;
};

export type WorkforceBudget = {
  totalAvailableHours: number;
  totalRequiredHours: number;
  shortageHours: number;
  surplusHours: number;
  bridgeRequiredDays: number;
  overtimeRequiredHours: number;
  externalSupportRequired: boolean;
  utilizationPercent: number;
};

export type EmployeePlan = {
  employeeId: string;
  name: string;
  plannedHours: number;
  /** Suggested allocation mix (planner strategy — solver executes). */
  allocation: ShiftAllocationType[];
  bridgeDays: number;
  overtimeHours: number;
  remainingBudgetHours: number;
};

export type BridgeAssignment = {
  date: string;
  dayOfWeek: number;
  employeeId: string | null;
  employeeName: string | null;
  amPeriod: { startTime: string; endTime: string } | null;
  pmPeriod: { startTime: string; endTime: string } | null;
  reason: string;
};

export type OvertimeAssignment = {
  date: string;
  dayOfWeek: number;
  employeeId: string | null;
  employeeName: string | null;
  hours: number;
  startTime: string;
  endTime: string;
  reason: string;
};

export type CompensationLedgerEntry = {
  employeeId: string;
  name: string;
  extraHours: number;
  extraDays: number;
  bridgeShifts: number;
  overtimeHours: number;
  compensationOwedHours: number;
};

export type PlannerRecommendationType =
  | 'MOVE_WEEKLY_OFF'
  | 'USE_BRIDGE'
  | 'USE_OVERTIME'
  | 'ADD_EXTRA_DAY'
  | 'NEED_EXTERNAL_SUPPORT'
  | 'BALANCED';

export type PlannerRecommendation = {
  type: PlannerRecommendationType;
  title: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
  hoursSaved: number;
  coverageGained: number;
  affectedDays: string[];
  rank: number;
};

export type WorkforcePlan = {
  mode: 'normal' | 'ramadan';
  workforceBudget: WorkforceBudget;
  employeeResources: EmployeeResource[];
  employeePlans: EmployeePlan[];
  dailyPlans: DailyWorkload[];
  bridgeAssignments: BridgeAssignment[];
  overtimeAssignments: OvertimeAssignment[];
  compensationLedger: CompensationLedgerEntry[];
  recommendations: PlannerRecommendation[];
  /** One-line operations-manager summary of the strategy. */
  plannerDecision: string;
  /** Daily target patterns the solver should execute. */
  dailyTargetPlans: DailyTargetPlan[];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function dayName(dayOfWeek: number): string {
  return DOW_NAMES[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

function unavailKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

function buildUnavailMap(unavailability: Unavailability[]): Map<string, string> {
  const map = new Map<string, string>();
  unavailability.forEach((u) => map.set(unavailKey(u.empId, u.date), u.kind));
  return map;
}

function periodHours(startTime: string, endTime: string): number {
  return (periodEndMinutes(startTime, endTime) - parseTimeToMinutes(startTime)) / 60;
}

function maxDailyHoursForDay(isRamadan: boolean, input: GenerateScheduleInput): number {
  return isRamadan
    ? input.settings.ramadanMode.maxDailyHours
    : input.settings.normalMode.maxDailyHours;
}

function isEmployeeAvailable(
  emp: EmployeeCandidate,
  date: string,
  dayOfWeek: number,
  unavail: Map<string, string>
): boolean {
  const kind = unavail.get(unavailKey(emp.empId, date));
  if (kind === 'leave' || kind === 'holiday' || kind === 'absent' || kind === 'weekly_off') {
    return false;
  }
  if (emp.weeklyOffDay !== 'NONE' && emp.weeklyOffDay === dayOfWeek) return false;
  return true;
}

function countUnavailabilityKind(
  emp: EmployeeCandidate,
  days: DayOperatingConfig[],
  unavail: Map<string, string>,
  kinds: string[]
): number {
  let count = 0;
  days.forEach((d) => {
    const kind = unavail.get(unavailKey(emp.empId, d.date));
    if (kind && kinds.includes(kind)) count += 1;
  });
  return count;
}

// ---------------------------------------------------------------------------
// STEP 1 — Employee resources
// ---------------------------------------------------------------------------

function buildEmployeeResources(
  input: GenerateScheduleInput,
  unavail: Map<string, string>,
  statsByEmp: Map<string, HistoricalEmployeeStats>
): EmployeeResource[] {
  const dayCount = input.days.length;
  const overtimeAllowed = getSchedulePolicy(input).overtime.allowed;

  return input.regularEmployees.map((emp) => {
    let availableDays = 0;
    let maxWeeklyHours = 0;
    input.days.forEach((day) => {
      if (isEmployeeAvailable(emp, day.date, day.dayOfWeek, unavail)) {
        availableDays += 1;
        maxWeeklyHours += maxDailyHoursForDay(day.isRamadan, input);
      }
    });

    // Cap weekly hours by labour norm.
    const cappedWeeklyHours = Math.min(maxWeeklyHours, DEFAULT_WEEKLY_MAX_HOURS);
    const weeklyLeaveDays = countUnavailabilityKind(emp, input.days, unavail, ['weekly_off']);
    const annualLeaveDays = countUnavailabilityKind(emp, input.days, unavail, ['leave']);
    const publicHolidayDays = countUnavailabilityKind(emp, input.days, unavail, ['holiday']);

    const maxDaily = input.days.length
      ? maxDailyHoursForDay(input.days.some((d) => d.isRamadan), input)
      : input.settings.normalMode.maxDailyHours;

    const stats = statsByEmp.get(emp.empId);
    const priorHours = stats?.priorWeekHours ?? 0;
    const priorSplitDays = stats?.priorWeekSplitDays ?? 0;

    // Flexibility: more available days + lighter prior week + unused split budget = higher.
    const availabilityRatio = dayCount > 0 ? availableDays / dayCount : 0;
    const priorLoadPenalty = Math.min(30, (priorHours / DEFAULT_WEEKLY_MAX_HOURS) * 30);
    const splitPenalty = Math.min(10, priorSplitDays * 5);
    const flexibilityScore = clampPercent(
      availabilityRatio * 70 + 30 - priorLoadPenalty - splitPenalty
    );

    return {
      employeeId: emp.empId,
      name: emp.name,
      availableDays,
      weeklyLeaveDays,
      annualLeaveDays,
      publicHolidayDays,
      maxDailyHours: maxDaily,
      maxWeeklyHours: round1(cappedWeeklyHours),
      availableWeeklyHours: round1(cappedWeeklyHours),
      splitBudget: input.settings.splitShiftAllowed
        ? Math.max(0, input.settings.maxSplitDaysPerEmployeePerWeek - priorSplitDays)
        : 0,
      overtimeBudget: overtimeAllowed ? DEFAULT_WEEKLY_OVERTIME_BUDGET : 0,
      flexibilityScore,
    };
  });
}

// ---------------------------------------------------------------------------
// STEP 2 — Daily workload
// ---------------------------------------------------------------------------

function buildDailyWorkloads(
  input: GenerateScheduleInput,
  unavail: Map<string, string>
): DailyWorkload[] {
  return input.days.map((day) => {
    const requiredHours = day.operatingPeriods.reduce(
      (sum, p) => sum + periodHours(p.startTime, p.endTime) * p.minCoverage,
      0
    );
    const peakCoverage = day.operatingPeriods.reduce((max, p) => Math.max(max, p.minCoverage), 0);

    const availableEmployees = input.regularEmployees.filter((emp) =>
      isEmployeeAvailable(emp, day.date, day.dayOfWeek, unavail)
    ).length;
    const maxDaily = maxDailyHoursForDay(day.isRamadan, input);
    const availableHours = availableEmployees * maxDaily;

    return {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      isRamadan: day.isRamadan,
      periodCount: day.operatingPeriods.length,
      requiredHours: round1(requiredHours),
      availableHours: round1(availableHours),
      shortageHours: round1(Math.max(0, requiredHours - availableHours)),
      peakCoverage,
      availableEmployees,
    };
  });
}

// ---------------------------------------------------------------------------
// STEP 4 — Bridge planning
// ---------------------------------------------------------------------------

/**
 * Bridge is required ONLY when a multi-period day cannot staff both AM and PM at
 * minimum coverage independently, but a single employee bridging both would help.
 */
function planBridges(
  input: GenerateScheduleInput,
  dailyPlans: DailyWorkload[],
  resources: EmployeeResource[],
  unavail: Map<string, string>
): BridgeAssignment[] {
  const bridges: BridgeAssignment[] = [];
  // Rotate bridge candidates by flexibility to keep distribution equal.
  const bridgeCounts = new Map<string, number>();
  resources.forEach((r) => bridgeCounts.set(r.employeeId, 0));

  input.days.forEach((day) => {
    if (day.operatingPeriods.length < 2) return;
    const plan = dailyPlans.find((d) => d.date === day.date);
    if (!plan) return;

    const amPeriod = day.operatingPeriods[0];
    const pmPeriod = day.operatingPeriods[day.operatingPeriods.length - 1];
    const amMin = amPeriod.minCoverage;
    const pmMin = pmPeriod.minCoverage;
    const combinedMin = amMin + pmMin;

    const available = plan.availableEmployees;
    // Both periods would fall below minimum if staffed separately, but bridging can help.
    const amBelow = available < amMin + pmMin && available < combinedMin;
    const canBridge = available >= 1 && available < combinedMin && available >= Math.max(amMin, pmMin);

    if (!amBelow || !canBridge) return;

    // Pick most flexible available employee with fewest existing bridges.
    const candidates = resources
      .filter((r) => {
        const emp = input.regularEmployees.find((e) => e.empId === r.employeeId);
        return emp ? isEmployeeAvailable(emp, day.date, day.dayOfWeek, unavail) : false;
      })
      .sort((a, b) => {
        const bc = (bridgeCounts.get(a.employeeId) ?? 0) - (bridgeCounts.get(b.employeeId) ?? 0);
        if (bc !== 0) return bc;
        return b.flexibilityScore - a.flexibilityScore;
      });

    const chosen = candidates[0] ?? null;
    if (chosen) {
      bridgeCounts.set(chosen.employeeId, (bridgeCounts.get(chosen.employeeId) ?? 0) + 1);
    }

    bridges.push({
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      employeeId: chosen?.employeeId ?? null,
      employeeName: chosen?.name ?? null,
      amPeriod: { startTime: amPeriod.startTime, endTime: amPeriod.endTime },
      pmPeriod: { startTime: pmPeriod.startTime, endTime: pmPeriod.endTime },
      reason: `AM (${amPeriod.startTime}–${amPeriod.endTime}) and PM (${pmPeriod.startTime}–${pmPeriod.endTime}) both fall below minimum with ${available} available; one bridging employee covers both.`,
    });
  });

  return bridges;
}

// ---------------------------------------------------------------------------
// STEP 5 — Overtime planning
// ---------------------------------------------------------------------------

function planOvertime(
  input: GenerateScheduleInput,
  dailyPlans: DailyWorkload[],
  resources: EmployeeResource[],
  unavail: Map<string, string>
): OvertimeAssignment[] {
  const policy = getSchedulePolicy(input);
  if (!policy.overtime.allowed) return [];

  const assignments: OvertimeAssignment[] = [];
  const otByEmp = new Map<string, number>();
  resources.forEach((r) => otByEmp.set(r.employeeId, 0));

  input.days.forEach((day) => {
    const plan = dailyPlans.find((d) => d.date === day.date);
    if (!plan || plan.shortageHours <= 0) return;

    // Overtime targets the evening (last) operating period gap.
    const pmPeriod = day.operatingPeriods[day.operatingPeriods.length - 1];
    if (!pmPeriod) return;

    // Pick lightest-loaded available employee with remaining OT budget.
    const candidates = resources
      .filter((r) => {
        const emp = input.regularEmployees.find((e) => e.empId === r.employeeId);
        const available = emp ? isEmployeeAvailable(emp, day.date, day.dayOfWeek, unavail) : false;
        return available && (otByEmp.get(r.employeeId) ?? 0) < r.overtimeBudget;
      })
      .sort((a, b) => (otByEmp.get(a.employeeId) ?? 0) - (otByEmp.get(b.employeeId) ?? 0));

    const chosen = candidates[0] ?? null;
    // Cap the day's overtime suggestion to a sane block (2h) toward the shortage.
    const hours = Math.min(2, round1(plan.shortageHours));
    if (hours <= 0) return;

    if (chosen) {
      otByEmp.set(chosen.employeeId, (otByEmp.get(chosen.employeeId) ?? 0) + hours);
    }

    const endMin = periodEndMinutes(pmPeriod.startTime, pmPeriod.endTime);
    const startMin = endMin - hours * 60;
    assignments.push({
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      employeeId: chosen?.employeeId ?? null,
      employeeName: chosen?.name ?? null,
      hours,
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
      reason: `Shortage of ${plan.shortageHours}h on ${dayName(day.dayOfWeek)}; ${hours}h overtime near end of PM period.`,
    });
  });

  return assignments;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// STEP 3 + 8 — Workforce budget and employee plans
// ---------------------------------------------------------------------------

function buildWorkforceBudget(
  resources: EmployeeResource[],
  dailyPlans: DailyWorkload[],
  bridges: BridgeAssignment[],
  overtime: OvertimeAssignment[]
): WorkforceBudget {
  const totalAvailableHours = round1(
    resources.reduce((sum, r) => sum + r.availableWeeklyHours, 0)
  );
  const totalRequiredHours = round1(dailyPlans.reduce((sum, d) => sum + d.requiredHours, 0));
  const shortageHours = round1(dailyPlans.reduce((sum, d) => sum + d.shortageHours, 0));
  const overtimeRequiredHours = round1(overtime.reduce((sum, o) => sum + o.hours, 0));
  const surplusHours = round1(Math.max(0, totalAvailableHours - totalRequiredHours));

  return {
    totalAvailableHours,
    totalRequiredHours,
    shortageHours,
    surplusHours,
    bridgeRequiredDays: bridges.length,
    overtimeRequiredHours,
    externalSupportRequired: shortageHours > overtimeRequiredHours + bridges.length * 4,
    utilizationPercent:
      totalAvailableHours > 0 ? clampPercent((totalRequiredHours / totalAvailableHours) * 100) : 0,
  };
}

function buildEmployeePlans(
  resources: EmployeeResource[],
  bridges: BridgeAssignment[],
  overtime: OvertimeAssignment[]
): EmployeePlan[] {
  const bridgeByEmp = new Map<string, number>();
  bridges.forEach((b) => {
    if (b.employeeId) bridgeByEmp.set(b.employeeId, (bridgeByEmp.get(b.employeeId) ?? 0) + 1);
  });
  const otByEmp = new Map<string, number>();
  overtime.forEach((o) => {
    if (o.employeeId) otByEmp.set(o.employeeId, (otByEmp.get(o.employeeId) ?? 0) + o.hours);
  });

  return resources.map((r) => {
    const bridgeDays = bridgeByEmp.get(r.employeeId) ?? 0;
    const overtimeHours = round1(otByEmp.get(r.employeeId) ?? 0);
    const allocation: ShiftAllocationType[] = ['AM', 'PM'];
    if (r.splitBudget > 0) allocation.push('SPLIT');
    if (bridgeDays > 0) allocation.push('BRIDGE');
    if (overtimeHours > 0) allocation.push('OVERTIME');

    // Planned hours = normal capacity contribution + overtime; bridge days imply longer days.
    const plannedHours = round1(
      Math.min(r.availableWeeklyHours, r.maxWeeklyHours) + overtimeHours
    );

    return {
      employeeId: r.employeeId,
      name: r.name,
      plannedHours,
      allocation,
      bridgeDays,
      overtimeHours,
      remainingBudgetHours: round1(Math.max(0, r.maxWeeklyHours - plannedHours + overtimeHours)),
    };
  });
}

// ---------------------------------------------------------------------------
// STEP 6 — Compensation ledger
// ---------------------------------------------------------------------------

function buildCompensationLedger(
  resources: EmployeeResource[],
  bridges: BridgeAssignment[],
  overtime: OvertimeAssignment[]
): CompensationLedgerEntry[] {
  const bridgeByEmp = new Map<string, number>();
  bridges.forEach((b) => {
    if (b.employeeId) bridgeByEmp.set(b.employeeId, (bridgeByEmp.get(b.employeeId) ?? 0) + 1);
  });
  const otByEmp = new Map<string, number>();
  overtime.forEach((o) => {
    if (o.employeeId) otByEmp.set(o.employeeId, (otByEmp.get(o.employeeId) ?? 0) + o.hours);
  });

  return resources
    .map((r) => {
      const bridgeShifts = bridgeByEmp.get(r.employeeId) ?? 0;
      const overtimeHours = round1(otByEmp.get(r.employeeId) ?? 0);
      const bridgeExtra = bridgeShifts * BRIDGE_COMPENSATION_HOURS;
      const extraHours = round1(overtimeHours + bridgeExtra);
      return {
        employeeId: r.employeeId,
        name: r.name,
        extraHours,
        extraDays: 0,
        bridgeShifts,
        overtimeHours,
        compensationOwedHours: extraHours,
      };
    })
    .filter((e) => e.extraHours > 0 || e.bridgeShifts > 0);
}

// ---------------------------------------------------------------------------
// STEP 10 — Planner recommendations
// ---------------------------------------------------------------------------

function buildRecommendations(
  input: GenerateScheduleInput,
  dailyPlans: DailyWorkload[],
  resources: EmployeeResource[],
  bridges: BridgeAssignment[],
  overtime: OvertimeAssignment[],
  budget: WorkforceBudget
): PlannerRecommendation[] {
  const recs: PlannerRecommendation[] = [];

  // 1) Move weekly off to shortage day if someone is off then and free elsewhere.
  const worstDay = [...dailyPlans].sort((a, b) => b.shortageHours - a.shortageHours)[0];
  if (worstDay && worstDay.shortageHours > 0) {
    const offEmp = input.regularEmployees.find(
      (emp) => emp.weeklyOffDay !== 'NONE' && emp.weeklyOffDay === worstDay.dayOfWeek
    );
    if (offEmp) {
      const surplusDay = [...dailyPlans]
        .filter((d) => d.dayOfWeek !== worstDay.dayOfWeek && d.shortageHours === 0)
        .sort((a, b) => b.availableEmployees - a.availableEmployees)[0];
      if (surplusDay) {
        recs.push({
          type: 'MOVE_WEEKLY_OFF',
          title: `Move ${offEmp.name} weekly off from ${dayName(worstDay.dayOfWeek)} to ${dayName(surplusDay.dayOfWeek)}`,
          reason: `${dayName(worstDay.dayOfWeek)} is short ${worstDay.shortageHours}h; ${dayName(surplusDay.dayOfWeek)} has spare capacity.`,
          impact: 'high',
          hoursSaved: round1(Math.min(worstDay.shortageHours, resources[0]?.maxDailyHours ?? 8)),
          coverageGained: worstDay.peakCoverage > 0 ? 1 : 0,
          affectedDays: [worstDay.date, surplusDay.date],
          rank: 1,
        });
      }
    }
  }

  // 2) Bridge recommendations (specific day).
  bridges.forEach((b) => {
    recs.push({
      type: 'USE_BRIDGE',
      title: `Use Bridge on ${dayName(b.dayOfWeek)}${b.employeeName ? ` (${b.employeeName})` : ''}`,
      reason: b.reason,
      impact: 'medium',
      hoursSaved: 0,
      coverageGained: 2,
      affectedDays: [b.date],
      rank: 3,
    });
  });

  // 3) Overtime recommendations grouped by day.
  overtime.forEach((o) => {
    recs.push({
      type: 'USE_OVERTIME',
      title: `Use overtime on ${dayName(o.dayOfWeek)}${o.employeeName ? ` (${o.employeeName} ${o.startTime}–${o.endTime})` : ''}`,
      reason: o.reason,
      impact: 'medium',
      hoursSaved: 0,
      coverageGained: 1,
      affectedDays: [o.date],
      rank: 4,
    });
  });

  // 4) External support LAST — only when strategy still leaves a gap.
  if (budget.externalSupportRequired) {
    const shortDays = dailyPlans.filter((d) => d.shortageHours > 0).map((d) => d.date);
    const worst = [...dailyPlans].sort((a, b) => b.shortageHours - a.shortageHours)[0];
    recs.push({
      type: 'NEED_EXTERNAL_SUPPORT',
      title: `Need external support${worst ? ` ${dayName(worst.dayOfWeek)} only` : ''}`,
      reason: `Bridge and overtime cannot fully close ${budget.shortageHours}h shortage; external coverage is the last resort.`,
      impact: 'high',
      hoursSaved: 0,
      coverageGained: worst?.peakCoverage ?? 2,
      affectedDays: shortDays,
      rank: 5,
    });
  }

  if (recs.length === 0) {
    recs.push({
      type: 'BALANCED',
      title: 'Workforce is balanced for this week',
      reason: `Available ${budget.totalAvailableHours}h covers required ${budget.totalRequiredHours}h without bridge or overtime.`,
      impact: 'low',
      hoursSaved: 0,
      coverageGained: 0,
      affectedDays: [],
      rank: 9,
    });
  }

  return recs.sort((a, b) => a.rank - b.rank);
}

function buildPlannerDecision(budget: WorkforceBudget, bridges: number, overtime: number): string {
  if (budget.shortageHours <= 0) {
    return `Balanced week — distribute ${budget.totalRequiredHours}h across available staff (${budget.utilizationPercent}% utilization); no bridge or overtime needed.`;
  }
  const parts: string[] = [];
  if (bridges > 0) parts.push(`${bridges} bridge day(s)`);
  if (overtime > 0) parts.push(`${overtime}h overtime`);
  if (budget.externalSupportRequired) parts.push('external support (last resort)');
  const strategy = parts.length ? parts.join(' + ') : 'redistribute weekly off';
  return `Shortage ${budget.shortageHours}h — minimize fatigue via ${strategy} before assigning shifts.`;
}

// ---------------------------------------------------------------------------
// Daily target patterns (solver executes these)
// ---------------------------------------------------------------------------

const TARGET_AM_SAT_THU = 2;
const TARGET_PM_SAT_THU = 2;
const TARGET_PM_FRIDAY = 2;

/** Build per-day target patterns for the planner-guided solver. */
export function buildDailyTargetPlans(
  input: GenerateScheduleInput,
  unavail: Map<string, string>,
  weeklyOff: Map<string, number> = new Map()
): DailyTargetPlan[] {
  return input.days.map((day) => {
    const availableEmployees = input.regularEmployees.filter((emp) => {
      if (!isEmployeeAvailable(emp, day.date, day.dayOfWeek, unavail)) return false;
      const offDow = weeklyOff.get(emp.empId);
      if (offDow !== undefined && day.dayOfWeek === offDow) return false;
      return true;
    }).length;

    const isFridayPmOnly =
      day.dayOfWeek === FRIDAY_DOW && !day.isRamadan && day.operatingPeriods.length === 1;

    if (isFridayPmOnly) {
      return {
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        pattern: 'FRIDAY_PM_ONLY' as const,
        availableEmployees,
        targetAm: 0,
        targetPm: TARGET_PM_FRIDAY,
        targetBridge: 0,
      };
    }

    if (availableEmployees === 3) {
      return {
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        pattern: 'SHORTAGE_3_STAFF' as const,
        availableEmployees,
        targetAm: 1,
        targetPm: 1,
        targetBridge: 1,
      };
    }

    return {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      pattern: 'NORMAL' as const,
      availableEmployees,
      targetAm: TARGET_AM_SAT_THU,
      targetPm: TARGET_PM_SAT_THU,
      targetBridge: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/** Plan the week's workforce strategy. Never assigns shifts — the solver executes this. */
export function planWeeklyResources(input: GenerateScheduleInput): WorkforcePlan {
  const policy = getSchedulePolicy(input);
  const unavail = buildUnavailMap(input.unavailability);
  const statsByEmp = new Map<string, HistoricalEmployeeStats>();
  input.historicalStats.forEach((s) => statsByEmp.set(s.empId, s));

  const employeeResources = buildEmployeeResources(input, unavail, statsByEmp);
  const dailyPlans = buildDailyWorkloads(input, unavail);
  const dailyTargetPlans = buildDailyTargetPlans(input, unavail);
  const bridgeAssignments = planBridges(input, dailyPlans, employeeResources, unavail);
  const overtimeAssignments = planOvertime(input, dailyPlans, employeeResources, unavail);
  const workforceBudget = buildWorkforceBudget(
    employeeResources,
    dailyPlans,
    bridgeAssignments,
    overtimeAssignments
  );
  const employeePlans = buildEmployeePlans(employeeResources, bridgeAssignments, overtimeAssignments);
  const compensationLedger = buildCompensationLedger(
    employeeResources,
    bridgeAssignments,
    overtimeAssignments
  );
  const recommendations = buildRecommendations(
    input,
    dailyPlans,
    employeeResources,
    bridgeAssignments,
    overtimeAssignments,
    workforceBudget
  );

  return {
    mode: policy.mode,
    workforceBudget,
    employeeResources,
    employeePlans,
    dailyPlans,
    bridgeAssignments,
    overtimeAssignments,
    compensationLedger,
    recommendations,
    plannerDecision: buildPlannerDecision(
      workforceBudget,
      bridgeAssignments.length,
      workforceBudget.overtimeRequiredHours
    ),
    dailyTargetPlans,
  };
}
