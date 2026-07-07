/**
 * Workforce Strategy AI — weekly planning brain above Schedule Engine v3.
 * Decides HOW to manage the week; never assigns shifts.
 */

import { FRIDAY_DOW } from '@/lib/schedule/policyEngine';
import {
  planWeeklyResources,
  DEFAULT_WEEKLY_MAX_HOURS,
  DEFAULT_WEEKLY_OVERTIME_BUDGET,
  type BridgeAssignment,
  type DailyWorkload,
  type OvertimeAssignment,
} from '@/lib/schedule/resourcePlanner';
import type {
  EmployeeCandidate,
  GenerateScheduleInput,
  HistoricalEmployeeStats,
  Unavailability,
} from '@/lib/schedule/generateSchedule/types';

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type WeeklyStrategySummary = {
  employeeCount: number;
  onLeaveCount: number;
  requiredHours: number;
  availableHours: number;
  shortageHours: number;
  peakDemandDays: string[];
  lowestDemandDays: string[];
  lines: string[];
};

export type WeeklyDemandDay = {
  date: string;
  dayName: string;
  requiredHours: number;
  availableHours: number;
  shortageHours: number;
  peakCoverage: number;
  availableEmployees: number;
};

export type StaffSituationEmployee = { empId: string; name: string; detail?: string };

export type StaffSituation = {
  availableEmployees: StaffSituationEmployee[];
  onLeave: StaffSituationEmployee[];
  nearingWeeklyLimit: StaffSituationEmployee[];
  suitableForBridge: StaffSituationEmployee[];
  suitableForOvertime: StaffSituationEmployee[];
  movableWeeklyOff: StaffSituationEmployee[];
  overloaded: StaffSituationEmployee[];
};

export type WeeklyOffMovePlan = {
  empId: string;
  name: string;
  fromDayOfWeek: number;
  toDayOfWeek: number;
  fromDayName: string;
  toDayName: string;
  fromDate: string;
  toDate: string;
};

export type WorkforceStrategyPlan = {
  needBridge: boolean;
  needWeeklyOffMove: boolean;
  needOvertime: boolean;
  needExternalSupport: boolean;
  bridgeDays: string[];
  overtimeDays: string[];
  weeklyOffMoveDays: WeeklyOffMovePlan[];
  externalSupportDays: string[];
};

export type StrategyRecommendation = {
  rank: number;
  title: string;
  impact: 'high' | 'medium' | 'low';
  reason: string;
  estimatedImprovement: string;
  category: 'WEEKLY_OFF' | 'BRIDGE' | 'OVERTIME' | 'EXTERNAL_SUPPORT' | 'NONE';
};

export type StrategyDecision = {
  step: number;
  question: string;
  answer: 'yes' | 'no';
  outcome: string;
};

export type StrategyExecutionHints = {
  scenarioRotation: number;
  bridgeRotationOffset: number;
  allowWeeklyOffMove: boolean;
  allowBridge: boolean;
  allowOvertime: boolean;
  useExternalSupport: boolean;
  preferredWeeklyOffMoves: WeeklyOffMovePlan[];
};

export type WorkforceWeeklyStrategy = {
  summary: WeeklyStrategySummary;
  weeklyDemand: { days: WeeklyDemandDay[] };
  staffSituation: StaffSituation;
  strategy: WorkforceStrategyPlan;
  decisions: StrategyDecision[];
  recommendations: StrategyRecommendation[];
  plannerIntent: { text: string };
  execution: StrategyExecutionHints;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
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

function maxDailyHoursForDay(isRamadan: boolean, input: GenerateScheduleInput): number {
  return isRamadan ? input.settings.ramadanMode.maxDailyHours : input.settings.normalMode.maxDailyHours;
}

function isEmployeeAvailable(
  emp: EmployeeCandidate,
  date: string,
  dayOfWeek: number,
  unavail: Map<string, string>,
  weeklyOffOverrides: Map<string, number>
): boolean {
  const kind = unavail.get(unavailKey(emp.empId, date));
  if (kind === 'leave' || kind === 'holiday' || kind === 'absent' || kind === 'weekly_off') {
    return false;
  }
  const offDow = weeklyOffOverrides.has(emp.empId)
    ? weeklyOffOverrides.get(emp.empId)!
    : emp.weeklyOffDay === 'NONE'
      ? null
      : emp.weeklyOffDay;
  if (offDow !== null && dayOfWeek === offDow) return false;
  return true;
}

function periodHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let end = eh * 60 + em;
  const start = sh * 60 + sm;
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

function computeDailyWorkloads(
  input: GenerateScheduleInput,
  weeklyOffOverrides: Map<string, number> = new Map()
): DailyWorkload[] {
  const unavail = buildUnavailMap(input.unavailability);
  return input.days.map((day) => {
    const requiredHours = day.operatingPeriods.reduce(
      (sum, p) => sum + periodHours(p.startTime, p.endTime) * p.minCoverage,
      0
    );
    const peakCoverage = day.operatingPeriods.reduce((max, p) => Math.max(max, p.minCoverage), 0);
    const availableEmployees = input.regularEmployees.filter((emp) =>
      isEmployeeAvailable(emp, day.date, day.dayOfWeek, unavail, weeklyOffOverrides)
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

function totalShortage(daily: DailyWorkload[]): number {
  return round1(daily.reduce((s, d) => s + d.shortageHours, 0));
}

function hasHeadcountGap(daily: DailyWorkload[]): boolean {
  return daily.some((d) => {
    if (d.dayOfWeek === FRIDAY_DOW && d.periodCount === 1) {
      return d.availableEmployees < 2;
    }
    if (d.periodCount >= 2) {
      return d.availableEmployees < 4 && d.availableEmployees < d.peakCoverage * 2;
    }
    return d.availableEmployees < d.peakCoverage;
  });
}

function weekCoversWithoutInterventions(input: GenerateScheduleInput, daily: DailyWorkload[]): boolean {
  return totalShortage(daily) <= 0 && !hasHeadcountGap(daily);
}

type WeeklyOffSimulation = {
  move: WeeklyOffMovePlan;
  overrides: Map<string, number>;
  daily: DailyWorkload[];
  resultingShortage: number;
};

function moveScore(daily: DailyWorkload[]): number {
  const gapPenalty = hasHeadcountGap(daily) ? 1000 : 0;
  return gapPenalty + totalShortage(daily) * 10;
}

function findBestWeeklyOffMove(input: GenerateScheduleInput): WeeklyOffSimulation | null {
  let best: WeeklyOffSimulation | null = null;

  for (const emp of input.regularEmployees) {
    if (emp.weeklyOffDay === 'NONE') continue;
    const fromDow = emp.weeklyOffDay as number;
    const fromDate = input.days.find((d) => d.dayOfWeek === fromDow)?.date;
    if (!fromDate) continue;

    for (const targetDay of input.days) {
      if (targetDay.dayOfWeek === fromDow) continue;
      const overrides = new Map<string, number>([[emp.empId, targetDay.dayOfWeek]]);
      const daily = computeDailyWorkloads(input, overrides);
      const resultingShortage = totalShortage(daily);
      const score = moveScore(daily);

      if (!best || score < moveScore(best.daily)) {
        best = {
          move: {
            empId: emp.empId,
            name: emp.name,
            fromDayOfWeek: fromDow,
            toDayOfWeek: targetDay.dayOfWeek,
            fromDayName: dayName(fromDow),
            toDayName: dayName(targetDay.dayOfWeek),
            fromDate,
            toDate: targetDay.date,
          },
          overrides,
          daily,
          resultingShortage,
        };
      }
    }
  }

  return best;
}

function bridgeCanCoverWeek(daily: DailyWorkload[]): boolean {
  return daily.every((d) => {
    if (d.shortageHours <= 0) return true;
    if (d.periodCount < 2) return d.availableEmployees >= d.peakCoverage;
    if (d.availableEmployees >= 4) return true;
    return d.availableEmployees === 3;
  });
}

function overtimeCanCoverHours(shortageHours: number, employeeCount: number): boolean {
  const budget = employeeCount * DEFAULT_WEEKLY_OVERTIME_BUDGET;
  return shortageHours > 0 && shortageHours <= budget;
}

function buildStaffSituation(
  input: GenerateScheduleInput,
  plan: ReturnType<typeof planWeeklyResources>
): StaffSituation {
  const unavail = buildUnavailMap(input.unavailability);
  const statsByEmp = new Map<string, HistoricalEmployeeStats>();
  input.historicalStats.forEach((s) => statsByEmp.set(s.empId, s));

  const leaveByEmp = new Map<string, number>();
  input.unavailability
    .filter((u) => u.kind === 'leave')
    .forEach((u) => leaveByEmp.set(u.empId, (leaveByEmp.get(u.empId) ?? 0) + 1));

  const onLeave = input.regularEmployees
    .filter((e) => (leaveByEmp.get(e.empId) ?? 0) > 0)
    .map((e) => ({
      empId: e.empId,
      name: e.name,
      detail: `${leaveByEmp.get(e.empId)} leave day(s)`,
    }));

  const availableEmployees = input.regularEmployees
    .filter((e) => !onLeave.some((l) => l.empId === e.empId) || (leaveByEmp.get(e.empId) ?? 0) < 7)
    .map((e) => ({ empId: e.empId, name: e.name }));

  const nearingWeeklyLimit = plan.employeeResources
    .filter((r) => r.availableWeeklyHours >= DEFAULT_WEEKLY_MAX_HOURS - 4)
    .map((r) => ({
      empId: r.employeeId,
      name: r.name,
      detail: `${r.availableWeeklyHours}h capacity`,
    }));

  const suitableForBridge = plan.employeeResources
    .filter((r) => r.flexibilityScore >= 50)
    .sort((a, b) => b.flexibilityScore - a.flexibilityScore)
    .map((r) => ({
      empId: r.employeeId,
      name: r.name,
      detail: `flex ${r.flexibilityScore}`,
    }));

  const suitableForOvertime = plan.employeeResources
    .filter((r) => r.overtimeBudget > 0)
    .map((r) => ({
      empId: r.employeeId,
      name: r.name,
      detail: `${r.overtimeBudget}h OT budget`,
    }));

  const movableWeeklyOff = input.regularEmployees
    .filter((e) => e.weeklyOffDay !== 'NONE')
    .map((e) => ({
      empId: e.empId,
      name: e.name,
      detail: `off ${dayName(e.weeklyOffDay as number)}`,
    }));

  const overloaded = input.regularEmployees
    .filter((e) => (statsByEmp.get(e.empId)?.priorWeekHours ?? 0) >= 44)
    .map((e) => ({
      empId: e.empId,
      name: e.name,
      detail: `${statsByEmp.get(e.empId)?.priorWeekHours ?? 0}h prior week`,
    }));

  void unavail;
  return {
    availableEmployees,
    onLeave,
    nearingWeeklyLimit,
    suitableForBridge,
    suitableForOvertime,
    movableWeeklyOff,
    overloaded,
  };
}

function buildSummary(
  input: GenerateScheduleInput,
  daily: DailyWorkload[],
  staff: StaffSituation
): WeeklyStrategySummary {
  const requiredHours = round1(daily.reduce((s, d) => s + d.requiredHours, 0));
  const availableHours = round1(daily.reduce((s, d) => s + d.availableHours, 0));
  const shortageHours = totalShortage(daily);
  const sorted = [...daily].sort((a, b) => b.requiredHours - a.requiredHours);
  const peakDemandDays = sorted.slice(0, 2).map((d) => dayName(d.dayOfWeek));
  const lowestDemandDays = [...daily].sort((a, b) => a.requiredHours - b.requiredHours).slice(0, 1).map((d) => dayName(d.dayOfWeek));

  const lines = [
    `${input.regularEmployees.length} employees`,
    staff.onLeave.length > 0 ? `${staff.onLeave.length} employee(s) on leave` : null,
    `${requiredHours} required hours`,
    `${availableHours} available`,
    shortageHours > 0 ? `${shortageHours} hour shortage` : 'No hour shortage',
    peakDemandDays.length ? `Peak demand: ${peakDemandDays.join(', ')}` : null,
    lowestDemandDays.length ? `Lowest demand: ${lowestDemandDays.join(', ')}` : null,
  ].filter(Boolean) as string[];

  return {
    employeeCount: input.regularEmployees.length,
    onLeaveCount: staff.onLeave.length,
    requiredHours,
    availableHours,
    shortageHours,
    peakDemandDays,
    lowestDemandDays,
    lines,
  };
}

function recommendationFromBridge(b: BridgeAssignment, rank: number): StrategyRecommendation {
  return {
    rank,
    title: `Bridge ${b.employeeName ?? 'staff'} on ${dayName(b.dayOfWeek)}`,
    impact: 'high',
    reason: b.reason,
    estimatedImprovement: 'Maintains both AM and PM coverage',
    category: 'BRIDGE',
  };
}

function recommendationFromOvertime(o: OvertimeAssignment, rank: number): StrategyRecommendation {
  return {
    rank,
    title: `Allow ${o.employeeName ?? 'staff'} ${o.hours}h overtime`,
    impact: 'medium',
    reason: o.reason,
    estimatedImprovement: `+${o.hours}h on ${dayName(o.dayOfWeek)}`,
    category: 'OVERTIME',
  };
}

function recommendationFromWeeklyOff(move: WeeklyOffMovePlan, rank: number, shortageDay: string): StrategyRecommendation {
  return {
    rank,
    title: `Move ${move.name} weekly off`,
    impact: 'high',
    reason: `Balances ${shortageDay} shortage by moving off from ${move.fromDayName} to ${move.toDayName}.`,
    estimatedImprovement: '+4 coverage slots',
    category: 'WEEKLY_OFF',
  };
}

function buildPlannerIntent(
  strategy: WorkforceStrategyPlan,
  summary: WeeklyStrategySummary,
  recommendations: StrategyRecommendation[]
): string {
  if (!strategy.needWeeklyOffMove && !strategy.needBridge && !strategy.needOvertime && !strategy.needExternalSupport) {
    return 'The week can be covered with the current team. No overtime, bridge, weekly off changes, or external support are required.';
  }

  const parts: string[] = [];
  if (strategy.needWeeklyOffMove && strategy.weeklyOffMoveDays[0]) {
    const m = strategy.weeklyOffMoveDays[0];
    parts.push(`Moving ${m.name}'s weekly off to ${m.toDayName} reduces pressure on ${m.fromDayName}.`);
  }
  if (strategy.needBridge && strategy.bridgeDays.length) {
    parts.push(`Bridge shift(s) on ${strategy.bridgeDays.map((d) => dayName(new Date(d + 'T12:00:00Z').getUTCDay())).join(', ')} keep both operating periods covered.`);
  }
  if (strategy.needOvertime) {
    parts.push(`Limited overtime (${summary.shortageHours}h gap) on peak days only.`);
  }
  if (strategy.needExternalSupport) {
    parts.push('External support is recommended as a last resort after internal options.');
  } else if (parts.length) {
    parts.push('No external support is required if these steps are applied.');
  }

  if (!parts.length && recommendations[0]) {
    parts.push(recommendations[0].reason);
  }

  return parts.join(' ');
}

/** Build the weekly workforce strategy (planning brain — does not assign shifts). */
export function buildWeeklyStrategy(input: GenerateScheduleInput): WorkforceWeeklyStrategy {
  const plan = planWeeklyResources(input);
  const baseDaily = computeDailyWorkloads(input);
  const staffSituation = buildStaffSituation(input, plan);
  const summary = buildSummary(input, baseDaily, staffSituation);
  const decisions: StrategyDecision[] = [];
  const recommendations: StrategyRecommendation[] = [];

  const weeklyDemand = {
    days: baseDaily.map((d) => ({
      date: d.date,
      dayName: dayName(d.dayOfWeek),
      requiredHours: d.requiredHours,
      availableHours: d.availableHours,
      shortageHours: d.shortageHours,
      peakCoverage: d.peakCoverage,
      availableEmployees: d.availableEmployees,
    })),
  };

  const strategy: WorkforceStrategyPlan = {
    needBridge: false,
    needWeeklyOffMove: false,
    needOvertime: false,
    needExternalSupport: false,
    bridgeDays: [],
    overtimeDays: [],
    weeklyOffMoveDays: [],
    externalSupportDays: [],
  };

  let rank = 1;
  const woSimulation = findBestWeeklyOffMove(input);
  const dailyAfterWo = woSimulation?.daily ?? baseDaily;
  const shortageAfterWo = woSimulation?.resultingShortage ?? totalShortage(baseDaily);

  // 1 — Existing staff
  const existingOk = weekCoversWithoutInterventions(input, baseDaily);
  decisions.push({
    step: 1,
    question: 'Can existing staff satisfy the week?',
    answer: existingOk ? 'yes' : 'no',
    outcome: existingOk
      ? 'Current roster covers required hours and headcount.'
      : `${summary.shortageHours}h shortage or headcount gap detected.`,
  });

  if (existingOk) {
    recommendations.push({
      rank: rank++,
      title: 'Standard weekly roster',
      impact: 'low',
      reason: 'Available hours meet demand with current weekly offs.',
      estimatedImprovement: 'No changes needed',
      category: 'NONE',
    });
    return finalize(input, summary, weeklyDemand, staffSituation, strategy, decisions, recommendations, 0);
  }

  // 2 — Weekly off move
  const woFixesWeek =
    woSimulation !== null &&
    woSimulation.resultingShortage <= 0 &&
    !hasHeadcountGap(woSimulation.daily);
  decisions.push({
    step: 2,
    question: 'Can moving weekly off create a valid week?',
    answer: woFixesWeek ? 'yes' : 'no',
    outcome: woFixesWeek
      ? `Moving ${woSimulation!.move.name}'s off to ${woSimulation!.move.toDayName} closes the gap.`
      : 'Weekly off moves alone do not fully close the week.',
  });

  if (woFixesWeek && woSimulation) {
    strategy.needWeeklyOffMove = true;
    strategy.weeklyOffMoveDays = [woSimulation.move];
    recommendations.push(
      recommendationFromWeeklyOff(woSimulation.move, rank++, woSimulation.move.fromDayName)
    );
    return finalize(input, summary, weeklyDemand, staffSituation, strategy, decisions, recommendations, 0);
  }

  const evalDaily = woSimulation && shortageAfterWo < totalShortage(baseDaily) ? dailyAfterWo : baseDaily;
  if (woSimulation && shortageAfterWo < totalShortage(baseDaily)) {
    strategy.needWeeklyOffMove = true;
    strategy.weeklyOffMoveDays = [woSimulation.move];
    recommendations.push(
      recommendationFromWeeklyOff(woSimulation.move, rank++, woSimulation.move.fromDayName)
    );
  }

  const staffCount = input.regularEmployees.length;
  const impossibleWithoutExternal =
    staffCount < 3 ||
    (hasHeadcountGap(baseDaily) && !bridgeCanCoverWeek(baseDaily) && totalShortage(baseDaily) > 0);

  // 3 — Bridge
  const bridgeDays = plan.bridgeAssignments;
  const bridgeOnly = bridgeCanCoverWeek(evalDaily) && bridgeDays.length > 0;
  decisions.push({
    step: 3,
    question: 'Can Bridge solve it?',
    answer: bridgeOnly ? 'yes' : 'no',
    outcome: bridgeOnly
      ? `${bridgeDays.length} bridge day(s) cover AM and PM together.`
      : 'Bridge alone does not close all gaps.',
  });

  if (bridgeOnly && staffCount >= 3) {
    strategy.needBridge = true;
    strategy.bridgeDays = bridgeDays.map((b) => b.date);
    bridgeDays.forEach((b) => recommendations.push(recommendationFromBridge(b, rank++)));
    return finalize(input, summary, weeklyDemand, staffSituation, strategy, decisions, recommendations, 0);
  }

  // 4 — Overtime
  const otAssignments = plan.overtimeAssignments;
  const remainingShortage = totalShortage(evalDaily);
  const otOnly =
    otAssignments.length > 0 &&
    overtimeCanCoverHours(remainingShortage, input.regularEmployees.length) &&
    bridgeDays.length === 0;
  decisions.push({
    step: 4,
    question: 'Can limited overtime solve it?',
    answer: otOnly ? 'yes' : 'no',
    outcome: otOnly
      ? `${round1(remainingShortage)}h can be covered with limited overtime.`
      : 'Overtime alone is insufficient.',
  });

  if (otOnly && staffCount >= 3) {
    strategy.needOvertime = true;
    strategy.overtimeDays = otAssignments.map((o) => o.date);
    otAssignments.forEach((o) => recommendations.push(recommendationFromOvertime(o, rank++)));
    return finalize(input, summary, weeklyDemand, staffSituation, strategy, decisions, recommendations, 0);
  }

  // 5 — Bridge + overtime hybrid
  const hybrid = bridgeDays.length > 0 && otAssignments.length > 0;
  decisions.push({
    step: 5,
    question: 'Can bridge + overtime solve it?',
    answer: hybrid ? 'yes' : 'no',
    outcome: hybrid
      ? 'Combine bridge days with short overtime blocks.'
      : 'Hybrid internal plan still leaves a gap.',
  });

  if (hybrid && !impossibleWithoutExternal && !plan.workforceBudget.externalSupportRequired) {
    strategy.needBridge = true;
    strategy.needOvertime = true;
    strategy.bridgeDays = bridgeDays.map((b) => b.date);
    strategy.overtimeDays = otAssignments.map((o) => o.date);
    bridgeDays.forEach((b) => recommendations.push(recommendationFromBridge(b, rank++)));
    otAssignments.forEach((o) => recommendations.push(recommendationFromOvertime(o, rank++)));
    return finalize(input, summary, weeklyDemand, staffSituation, strategy, decisions, recommendations, 0);
  }

  // 6 — External support (last)
  const needExternal = plan.workforceBudget.externalSupportRequired || impossibleWithoutExternal;
  decisions.push({
    step: 6,
    question: 'Is external support required?',
    answer: needExternal ? 'yes' : 'no',
    outcome: needExternal
      ? 'Internal options cannot fully close the week — external support is last resort.'
      : 'Internal hybrid plan is sufficient.',
  });

  if (hybrid) {
    strategy.needBridge = true;
    strategy.needOvertime = true;
    strategy.bridgeDays = bridgeDays.map((b) => b.date);
    strategy.overtimeDays = otAssignments.map((o) => o.date);
    bridgeDays.forEach((b) => recommendations.push(recommendationFromBridge(b, rank++)));
    otAssignments.forEach((o) => recommendations.push(recommendationFromOvertime(o, rank++)));
  } else if (bridgeDays.length > 0) {
    strategy.needBridge = true;
    strategy.bridgeDays = bridgeDays.map((b) => b.date);
    bridgeDays.forEach((b) => recommendations.push(recommendationFromBridge(b, rank++)));
  } else if (otAssignments.length > 0) {
    strategy.needOvertime = true;
    strategy.overtimeDays = otAssignments.map((o) => o.date);
    otAssignments.forEach((o) => recommendations.push(recommendationFromOvertime(o, rank++)));
  }

  if (needExternal) {
    strategy.needExternalSupport = true;
    const shortDays = baseDaily.filter((d) => d.shortageHours > 0).map((d) => d.date);
    strategy.externalSupportDays = shortDays.length ? shortDays : [baseDaily[0]!.date];
    recommendations.push({
      rank: rank++,
      title: 'Add external support',
      impact: 'high',
      reason: 'Bridge and overtime cannot fully close remaining shortages.',
      estimatedImprovement: '+2 coverage slots on peak day',
      category: 'EXTERNAL_SUPPORT',
    });
  }

  recommendations.sort((a, b) => {
    const order = { WEEKLY_OFF: 1, BRIDGE: 2, OVERTIME: 3, EXTERNAL_SUPPORT: 4, NONE: 9 };
    const ca = order[a.category];
    const cb = order[b.category];
    if (ca !== cb) return ca - cb;
    return a.rank - b.rank;
  });
  recommendations.forEach((r, i) => {
    r.rank = i + 1;
  });

  return finalize(input, summary, weeklyDemand, staffSituation, strategy, decisions, recommendations, 0);
}

function finalize(
  input: GenerateScheduleInput,
  summary: WeeklyStrategySummary,
  weeklyDemand: WorkforceWeeklyStrategy['weeklyDemand'],
  staffSituation: StaffSituation,
  strategy: WorkforceStrategyPlan,
  decisions: StrategyDecision[],
  recommendations: StrategyRecommendation[],
  seedOffset: number
): WorkforceWeeklyStrategy {
  const bridgeOffset = strategy.bridgeDays.length > 0 ? seedOffset : 0;
  const execution: StrategyExecutionHints = {
    scenarioRotation: strategy.needWeeklyOffMove ? seedOffset + 1 : seedOffset,
    bridgeRotationOffset: bridgeOffset,
    allowWeeklyOffMove: strategy.needWeeklyOffMove,
    allowBridge: strategy.needBridge,
    allowOvertime: strategy.needOvertime,
    useExternalSupport: strategy.needExternalSupport || input.externalSupportEmployees.length > 0,
    preferredWeeklyOffMoves: strategy.weeklyOffMoveDays,
  };

  return {
    summary,
    weeklyDemand,
    staffSituation,
    strategy,
    decisions,
    recommendations,
    plannerIntent: { text: buildPlannerIntent(strategy, summary, recommendations) },
    execution,
  };
}

export function recommendationCategoryOrder(): string[] {
  return ['WEEKLY_OFF', 'BRIDGE', 'OVERTIME', 'EXTERNAL_SUPPORT'];
}
