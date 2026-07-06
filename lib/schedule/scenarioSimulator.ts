/**
 * Scenario Simulator — Workforce AI decision layer above Resource Planner + Engine v3.
 *
 *   Health Check → Resource Planner → Scenario Simulator → Constraint Analyzer → Solver → Apply
 *
 * Instead of only *recommending* actions, the simulator actually builds several
 * alternative workforce strategies, runs the analyzer + solver on a CLONE of the
 * input for each, scores the outcomes, and returns ranked options to the manager.
 *
 * Hard rules:
 *  - Never mutates the database. Every scenario runs on a deep clone of the input.
 *  - Never rewrites Engine v3 — it orchestrates the existing solver/analyzer.
 *  - Safe caps prevent long execution (max scenarios, max solves, time budget).
 */

import { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
import { analyzeScheduleConstraints, type ConstraintAnalysisStatus } from '@/lib/schedule/constraintAnalyzer';
import { qualityPercentsFromSolve } from '@/lib/schedule/scheduleQuality';
import {
  parseTimeToMinutes,
  periodEndMinutes,
} from '@/lib/schedule/generateSchedule/timeSlots';
import {
  planWeeklyResources,
  BRIDGE_COMPENSATION_HOURS,
  type CompensationLedgerEntry,
  type WorkforcePlan,
} from '@/lib/schedule/resourcePlanner';
import {
  scoreScenario,
  rankScenarioScores,
  type ScenarioScoreBreakdown,
} from '@/lib/schedule/scenarioScoring';
import type {
  EmployeeDayAssignment,
  GenerateScheduleInput,
  SlotViolation,
  SolverStatus,
} from '@/lib/schedule/generateSchedule/types';

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_MAX_SCENARIOS = 7;
export const DEFAULT_MAX_SCENARIO_SOLVE_MS = 3000;
export const HARD_MAX_SOLVES = 10;

export type ScenarioType =
  | 'BASELINE'
  | 'BRIDGE'
  | 'OVERTIME'
  | 'MOVE_WEEKLY_OFF'
  | 'EXTERNAL_SUPPORT'
  | 'REDUCE_LATE_COVERAGE'
  | 'HYBRID';

export type ScenarioAction = {
  kind: ScenarioType;
  label: string;
  date?: string;
  employeeId?: string;
  employeeName?: string;
  detail?: string;
};

export type ScenarioSimulationResult = {
  coverageValid: boolean;
  slotViolations: number;
  missingHours: number;
  bridgeCount: number;
  overtimeHours: number;
  externalSupportHours: number;
  weeklyOffMoves: number;
  fairnessHealth: number;
  staffAvailabilityHealth: number;
  constraintHealth: number;
  scheduleQuality: number;
  solverStatus: SolverStatus;
  analysisStatus: ConstraintAnalysisStatus;
};

export type ScenarioPreviewAssignment = {
  empId: string;
  name: string;
  date: string;
  isExternalSupport: boolean;
  shiftKind: string;
  totalHours: number;
  splitDay: boolean;
  segments: { startTime: string; endTime: string; periodIndex: number }[];
};

export type SimulatedScenario = {
  id: string;
  title: string;
  type: ScenarioType;
  description: string;
  actions: ScenarioAction[];
  simulationResult: ScenarioSimulationResult;
  score: number;
  scoreBreakdown: ScenarioScoreBreakdown;
  pros: string[];
  cons: string[];
  explanation: string;
  affectedDays: string[];
  compensationLedger: CompensationLedgerEntry[];
  remainingViolations: SlotViolation[];
  previewAssignments: ScenarioPreviewAssignment[];
};

export type ScenarioSimulationSummary = {
  totalScenarios: number;
  feasibleScenarios: number;
  bestScore: number;
  baselineFeasible: boolean;
  baselineCoverageValid: boolean;
  recommendation: string;
};

export type ScenarioSimulationPerformance = {
  scenariosGenerated: number;
  solves: number;
  totalMs: number;
  capped: boolean;
};

export type ScenarioSimulationOptions = {
  maxScenarios?: number;
  maxScenarioSolveMs?: number;
  maxSolves?: number;
  /** Force best-effort partial solves so gaps are measurable even when impossible. */
  forcePartialSolve?: boolean;
};

export type ScenarioSimulationOutput = {
  bestScenarioId: string;
  scenarios: SimulatedScenario[];
  summary: ScenarioSimulationSummary;
  performance: ScenarioSimulationPerformance;
};

function dayName(dow: number): string {
  return DOW_NAMES[dow] ?? `Day ${dow}`;
}

function cloneInput(input: GenerateScheduleInput): GenerateScheduleInput {
  return JSON.parse(JSON.stringify(input)) as GenerateScheduleInput;
}

function minutesToTime(minutes: number): string {
  const norm = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function slotHours(input: GenerateScheduleInput): number {
  return (input.settings.slotIntervalMinutes || 30) / 60;
}

function computeMissingHours(violations: SlotViolation[], hoursPerSlot: number): number {
  const missing = violations.reduce(
    (sum, v) => sum + Math.max(0, v.minCoverage - v.coverage) * hoursPerSlot,
    0
  );
  return Math.round(missing * 10) / 10;
}

function lastPeriodIndexByDate(input: GenerateScheduleInput): Map<string, number> {
  const map = new Map<string, number>();
  input.days.forEach((d) => map.set(d.date, Math.max(0, d.operatingPeriods.length - 1)));
  return map;
}

function isBridgeAssignment(
  a: EmployeeDayAssignment,
  lastByDate: Map<string, number>
): boolean {
  if (!a.splitDay) return false;
  const last = lastByDate.get(a.date);
  if (last === undefined || last === 0) return false;
  const idxs = a.segments.map((s) => s.periodIndex);
  return idxs.includes(0) && idxs.includes(last);
}

function countBridgeShifts(
  assignments: EmployeeDayAssignment[],
  lastByDate: Map<string, number>
): { total: number; maxPerEmployee: number } {
  const perEmp = new Map<string, number>();
  let total = 0;
  assignments.forEach((a) => {
    if (isBridgeAssignment(a, lastByDate)) {
      total += 1;
      perEmp.set(a.empId, (perEmp.get(a.empId) ?? 0) + 1);
    }
  });
  const maxPerEmployee = Array.from(perEmp.values()).reduce((m, n) => Math.max(m, n), 0);
  return { total, maxPerEmployee };
}

function externalSupportHours(
  assignments: EmployeeDayAssignment[],
  syntheticSupportIds: Set<string>
): number {
  const h = assignments
    .filter(
      (a) =>
        (a.isExternalSupport || syntheticSupportIds.has(a.empId)) &&
        a.shiftKind !== 'Off' &&
        a.shiftKind !== 'Leave'
    )
    .reduce((sum, a) => sum + a.totalHours, 0);
  return Math.round(h * 10) / 10;
}

function slimAssignments(
  assignments: EmployeeDayAssignment[],
  syntheticSupportIds: Set<string>
): ScenarioPreviewAssignment[] {
  return assignments
    .filter((a) => a.shiftKind !== 'Off' && a.shiftKind !== 'Leave')
    .map((a) => ({
      empId: a.empId,
      name: a.name,
      date: a.date,
      isExternalSupport: a.isExternalSupport || syntheticSupportIds.has(a.empId),
      shiftKind: a.shiftKind,
      totalHours: a.totalHours,
      splitDay: a.splitDay,
      segments: a.segments.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        periodIndex: s.periodIndex,
      })),
    }));
}

function buildCompensationLedger(
  assignments: EmployeeDayAssignment[],
  overtimeByEmp: Map<string, number>,
  lastByDate: Map<string, number>
): CompensationLedgerEntry[] {
  const bridgeByEmp = new Map<string, { name: string; bridges: number }>();
  assignments.forEach((a) => {
    if (isBridgeAssignment(a, lastByDate)) {
      const cur = bridgeByEmp.get(a.empId) ?? { name: a.name, bridges: 0 };
      cur.bridges += 1;
      bridgeByEmp.set(a.empId, cur);
    }
  });

  const nameByEmp = new Map<string, string>();
  assignments.forEach((a) => nameByEmp.set(a.empId, a.name));

  const empIds = Array.from(
    new Set([...Array.from(overtimeByEmp.keys()), ...Array.from(bridgeByEmp.keys())])
  );

  return empIds
    .map((empId) => {
      const overtime = Math.round((overtimeByEmp.get(empId) ?? 0) * 10) / 10;
      const bridges = bridgeByEmp.get(empId)?.bridges ?? 0;
      const extraHours = Math.round((overtime + bridges * BRIDGE_COMPENSATION_HOURS) * 10) / 10;
      return {
        employeeId: empId,
        name: bridgeByEmp.get(empId)?.name ?? nameByEmp.get(empId) ?? empId,
        extraHours,
        extraDays: 0,
        bridgeShifts: bridges,
        overtimeHours: overtime,
        compensationOwedHours: extraHours,
      };
    })
    .filter((e) => e.extraHours > 0 || e.bridgeShifts > 0);
}

// ---------------------------------------------------------------------------
// Scenario specs — each adjusts a CLONE of the input (no DB, no shared state).
// ---------------------------------------------------------------------------

type ScenarioSpec = {
  id: string;
  type: ScenarioType;
  title: string;
  description: string;
  explanation: string;
  actions: ScenarioAction[];
  weeklyOffMoves: number;
  /**
   * Employee IDs injected as extra bodies to model borrowed/external support.
   * They are added to the regular pool (so the functioning regular fill pass uses
   * them) but reported as external-support hours in metrics and preview.
   */
  syntheticSupportIds: string[];
  buildInput: () => GenerateScheduleInput;
};

function shortageDays(plan: WorkforcePlan): { date: string; dayOfWeek: number; shortageHours: number; peakCoverage: number }[] {
  return plan.dailyPlans
    .filter((d) => d.shortageHours > 0)
    .sort((a, b) => b.shortageHours - a.shortageHours)
    .map((d) => ({
      date: d.date,
      dayOfWeek: d.dayOfWeek,
      shortageHours: d.shortageHours,
      peakCoverage: d.peakCoverage,
    }));
}

function buildBaselineSpec(input: GenerateScheduleInput): ScenarioSpec {
  return {
    id: 'baseline',
    type: 'BASELINE',
    title: 'Baseline — current setup',
    description: 'Run the analyzer and solver exactly as configured today.',
    explanation:
      'The baseline runs Engine v3 with no adjustments so you can see current feasibility and compare every alternative against it.',
    actions: [],
    weeklyOffMoves: 0,
    syntheticSupportIds: [],
    buildInput: () => cloneInput(input),
  };
}

function buildBridgeSpec(input: GenerateScheduleInput, plan: WorkforcePlan): ScenarioSpec | null {
  if (plan.bridgeAssignments.length === 0) return null;
  const actions: ScenarioAction[] = plan.bridgeAssignments.map((b) => ({
    kind: 'BRIDGE',
    label: `Use Bridge ${dayName(b.dayOfWeek)}${b.employeeName ? ` for ${b.employeeName}` : ''}`,
    date: b.date,
    employeeName: b.employeeName ?? undefined,
    detail:
      b.amPeriod && b.pmPeriod
        ? `${b.amPeriod.startTime}–${b.amPeriod.endTime} + ${b.pmPeriod.startTime}–${b.pmPeriod.endTime}`
        : undefined,
  }));
  const first = plan.bridgeAssignments[0];
  return {
    id: 'bridge',
    type: 'BRIDGE',
    title: 'Bridge shifts on shortage days',
    description: 'One employee covers both morning opening and evening closing on tight days.',
    explanation: `${dayName(first.dayOfWeek)} has enough total staff hours, but AM and PM cannot both reach minimum coverage with normal shifts. A bridge shift covers morning opening and evening closing while preserving midday rest.`,
    actions,
    weeklyOffMoves: 0,
    syntheticSupportIds: [],
    buildInput: () => {
      const c = cloneInput(input);
      c.settings.splitShiftAllowed = true;
      c.settings.maxSplitDaysPerEmployeePerWeek = Math.max(
        3,
        c.settings.maxSplitDaysPerEmployeePerWeek
      );
      // Bridging implies a long day spanning AM+PM — allow the extra hours (tracked as compensation).
      c.settings.normalMode.maxDailyHours += 2;
      c.settings.ramadanMode.maxDailyHours += 1;
      return c;
    },
  };
}

function buildOvertimeSpec(input: GenerateScheduleInput, plan: WorkforcePlan): ScenarioSpec | null {
  const days = shortageDays(plan);
  if (days.length === 0) return null;
  const actions: ScenarioAction[] = days.slice(0, 4).map((d) => ({
    kind: 'OVERTIME',
    label: `Allow overtime ${dayName(d.dayOfWeek)} (up to 2h)`,
    date: d.date,
    detail: `Shortage ${d.shortageHours}h`,
  }));
  return {
    id: 'overtime',
    type: 'OVERTIME',
    title: 'Minimal rotating overtime',
    description: 'Extend shifts by up to 2h on shortage days, rotated fairly across staff.',
    explanation: `Shortage days can be closed by extending existing shifts by up to 2h. Overtime is rotated so no single employee absorbs all the extra load.`,
    actions,
    weeklyOffMoves: 0,
    syntheticSupportIds: [],
    buildInput: () => {
      const c = cloneInput(input);
      c.settings.normalMode.maxDailyHours += 2;
      c.settings.ramadanMode.maxDailyHours += 2;
      return c;
    },
  };
}

function buildMoveWeeklyOffSpec(
  input: GenerateScheduleInput,
  plan: WorkforcePlan
): ScenarioSpec | null {
  const shortage = shortageDays(plan);
  if (shortage.length === 0) return null;

  // Find an employee whose weekly off lands on a shortage day, and a surplus day to move it to.
  const surplusDays = plan.dailyPlans
    .filter((d) => d.shortageHours === 0)
    .sort((a, b) => b.availableEmployees - a.availableEmployees);
  if (surplusDays.length === 0) return null;

  let target: { empId: string; name: string; fromDow: number; fromDate: string } | null = null;
  for (let i = 0; i < shortage.length && !target; i += 1) {
    const day = shortage[i];
    const emp = input.regularEmployees.find(
      (e) => e.weeklyOffDay !== 'NONE' && e.weeklyOffDay === day.dayOfWeek
    );
    if (emp) target = { empId: emp.empId, name: emp.name, fromDow: day.dayOfWeek, fromDate: day.date };
  }
  if (!target) return null;

  const toDay = surplusDays[0];
  const captured = target;
  const actions: ScenarioAction[] = [
    {
      kind: 'MOVE_WEEKLY_OFF',
      label: `Move ${captured.name} weekly off from ${dayName(captured.fromDow)} to ${dayName(toDay.dayOfWeek)}`,
      employeeId: captured.empId,
      employeeName: captured.name,
      date: captured.fromDate,
      detail: `Frees ${captured.name} on ${dayName(captured.fromDow)}`,
    },
  ];

  return {
    id: 'move-weekly-off',
    type: 'MOVE_WEEKLY_OFF',
    title: 'Move a weekly off (simulation only)',
    description: 'Temporarily shift one weekly off from a shortage day to a quieter day.',
    explanation: `${captured.name} is off on ${dayName(captured.fromDow)}, a shortage day, while ${dayName(toDay.dayOfWeek)} has spare staff. Moving the weekly off frees a full shift where it is needed most. This is a simulation and does not change employee data.`,
    actions,
    weeklyOffMoves: 1,
    syntheticSupportIds: [],
    buildInput: () => {
      const c = cloneInput(input);
      const emp = c.regularEmployees.find((e) => e.empId === captured.empId);
      if (emp) emp.weeklyOffDay = toDay.dayOfWeek;
      // Reflect the move in unavailability: free the shortage date, block the surplus date.
      c.unavailability = c.unavailability.filter(
        (u) => !(u.empId === captured.empId && u.date === captured.fromDate && u.kind === 'weekly_off')
      );
      const alreadyOff = c.unavailability.some(
        (u) => u.empId === captured.empId && u.date === toDay.date
      );
      if (!alreadyOff) {
        c.unavailability.push({ empId: captured.empId, date: toDay.date, kind: 'weekly_off' });
      }
      return c;
    },
  };
}

function buildExternalSupportSpec(
  input: GenerateScheduleInput,
  plan: WorkforcePlan
): ScenarioSpec | null {
  const days = shortageDays(plan);
  if (days.length === 0) return null;
  const shortageDateSet = new Set(days.map((d) => d.date));
  const worst = days[0];

  const actions: ScenarioAction[] = days.slice(0, 3).map((d) => {
    const dayCfg = input.days.find((x) => x.date === d.date);
    const pm = dayCfg?.operatingPeriods[dayCfg.operatingPeriods.length - 1];
    return {
      kind: 'EXTERNAL_SUPPORT',
      label: `Add support ${dayName(d.dayOfWeek)}${pm ? ` ${pm.startTime}–${pm.endTime}` : ''}`,
      date: d.date,
      detail: pm ? `${pm.startTime}–${pm.endTime}` : undefined,
    };
  });

  return {
    id: 'external-support',
    type: 'EXTERNAL_SUPPORT',
    title: 'External support on shortage days only',
    description: 'Borrow a guest employee scoped to the exact days that fall short.',
    explanation: `Internal staff cannot close ${worst ? dayName(worst.dayOfWeek) : 'the shortage'} even with bridge or overtime. Adding external support limited to shortage days closes the gap without over-staffing the rest of the week.`,
    actions,
    weeklyOffMoves: 0,
    syntheticSupportIds: ['sim-external-1'],
    buildInput: () => {
      const c = cloneInput(input);
      c.settings.externalSupportEmployeesAllowed = true;
      const supportId = 'sim-external-1';
      // Modelled as an extra body in the regular pool so the solver actually uses it;
      // reported as external-support hours via syntheticSupportIds.
      c.regularEmployees.push({
        empId: supportId,
        name: 'External Support',
        isExternalSupport: false,
        weeklyOffDay: 'NONE',
      });
      c.historicalStats.push({
        empId: supportId,
        priorWeekHours: 0,
        priorWeekPmHours: 0,
        priorWeekFridayHours: 0,
        priorWeekSplitDays: 0,
      });
      // Scope the guest to shortage days only: mark all other days as unavailable.
      c.days.forEach((day) => {
        if (!shortageDateSet.has(day.date)) {
          c.unavailability.push({ empId: supportId, date: day.date, kind: 'weekly_off' });
        }
      });
      return c;
    },
  };
}

function buildReduceLateCoverageSpec(
  input: GenerateScheduleInput,
  plan: WorkforcePlan
): ScenarioSpec | null {
  const shortage = shortageDays(plan);
  if (shortage.length === 0) return null;

  // Only meaningful if some day's last period runs > 1h at minCoverage >= 2.
  const relaxable = input.days.filter((d) => {
    const last = d.operatingPeriods[d.operatingPeriods.length - 1];
    if (!last || last.minCoverage < 2) return false;
    return periodEndMinutes(last.startTime, last.endTime) - parseTimeToMinutes(last.startTime) >= 60;
  });
  if (relaxable.length === 0) return null;

  const actions: ScenarioAction[] = relaxable.slice(0, 4).map((d) => {
    const last = d.operatingPeriods[d.operatingPeriods.length - 1];
    const endMin = periodEndMinutes(last.startTime, last.endTime);
    const cut = minutesToTime(endMin - 60);
    return {
      kind: 'REDUCE_LATE_COVERAGE',
      label: `Reduce late coverage ${cut}–${last.endTime} from ${last.minCoverage} to ${last.minCoverage - 1} (${dayName(d.dayOfWeek)})`,
      date: d.date,
      detail: 'Policy relaxation',
    };
  });

  return {
    id: 'reduce-late-coverage',
    type: 'REDUCE_LATE_COVERAGE',
    title: 'Relax late-slot minimum coverage',
    description: 'Drop the final closing hour from 2 to 1 on tight days (policy relaxation).',
    explanation:
      'The last operating hour is typically the lowest-traffic slot. Reducing its minimum coverage from 2 to 1 removes hard-to-fill closing gaps with minimal service impact. Marked as a policy relaxation for manager approval.',
    actions,
    weeklyOffMoves: 0,
    syntheticSupportIds: [],
    buildInput: () => {
      const c = cloneInput(input);
      c.days.forEach((day) => {
        const periods = day.operatingPeriods;
        if (periods.length === 0) return;
        const last = periods[periods.length - 1];
        if (last.minCoverage < 2) return;
        const startMin = parseTimeToMinutes(last.startTime);
        const endMin = periodEndMinutes(last.startTime, last.endTime);
        if (endMin - startMin <= 60) {
          last.minCoverage -= 1;
          return;
        }
        const cutMin = endMin - 60;
        periods.splice(periods.length - 1, 1, {
          startTime: last.startTime,
          endTime: minutesToTime(cutMin),
          minCoverage: last.minCoverage,
        }, {
          startTime: minutesToTime(cutMin),
          endTime: last.endTime,
          minCoverage: Math.max(1, last.minCoverage - 1),
        });
      });
      return c;
    },
  };
}

function buildHybridSpec(input: GenerateScheduleInput, plan: WorkforcePlan): ScenarioSpec | null {
  const days = shortageDays(plan);
  if (days.length === 0) return null;
  const worst = days[0];
  const shortageDateSet = new Set([worst.date]);

  const actions: ScenarioAction[] = [
    { kind: 'BRIDGE', label: 'Enable small bridge where AM+PM both fall short', detail: 'Least invasive' },
    { kind: 'OVERTIME', label: 'Allow up to 1h overtime on shortage days', detail: 'Rotated fairly' },
    {
      kind: 'EXTERNAL_SUPPORT',
      label: `Limited external support ${dayName(worst.dayOfWeek)} only`,
      date: worst.date,
    },
  ];

  return {
    id: 'hybrid',
    type: 'HYBRID',
    title: 'Hybrid — least invasive mix',
    description: 'Combine a small bridge, minimal overtime, and limited external support.',
    explanation: `No single lever fully closes the week. A hybrid combines the smallest amounts of each — a little bridging, minimal overtime, and external support limited to ${dayName(worst.dayOfWeek)} — to reach coverage while spreading the strain.`,
    actions,
    weeklyOffMoves: 0,
    syntheticSupportIds: ['sim-hybrid-external-1'],
    buildInput: () => {
      const c = cloneInput(input);
      c.settings.splitShiftAllowed = true;
      c.settings.maxSplitDaysPerEmployeePerWeek = Math.max(
        2,
        c.settings.maxSplitDaysPerEmployeePerWeek
      );
      c.settings.normalMode.maxDailyHours += 1;
      c.settings.ramadanMode.maxDailyHours += 1;
      c.settings.externalSupportEmployeesAllowed = true;
      const supportId = 'sim-hybrid-external-1';
      c.regularEmployees.push({
        empId: supportId,
        name: 'External Support',
        isExternalSupport: false,
        weeklyOffDay: 'NONE',
      });
      c.historicalStats.push({
        empId: supportId,
        priorWeekHours: 0,
        priorWeekPmHours: 0,
        priorWeekFridayHours: 0,
        priorWeekSplitDays: 0,
      });
      c.days.forEach((day) => {
        if (!shortageDateSet.has(day.date)) {
          c.unavailability.push({ empId: supportId, date: day.date, kind: 'weekly_off' });
        }
      });
      return c;
    },
  };
}

// ---------------------------------------------------------------------------
// Simulate + score a single scenario spec
// ---------------------------------------------------------------------------

function simulateSpec(
  spec: ScenarioSpec,
  forcePartialSolve: boolean
): SimulatedScenario {
  const scenarioInput = spec.buildInput();
  const analysis = analyzeScheduleConstraints(scenarioInput);
  const result = generateSchedule(scenarioInput, { forcePartialSolve, preAnalyzed: true });

  const supportIds = new Set(spec.syntheticSupportIds);
  const lastByDate = lastPeriodIndexByDate(scenarioInput);
  const hoursPerSlot = slotHours(scenarioInput);
  const missingHours = computeMissingHours(result.slotViolations, hoursPerSlot);
  const { total: bridgeCount, maxPerEmployee } = countBridgeShifts(result.assignments, lastByDate);
  const overtimeByEmp = new Map<string, number>();
  result.employeeSummaries.forEach((s) => {
    if (s.overtimeHours > 0) overtimeByEmp.set(s.empId, s.overtimeHours);
  });
  const overtimeHours =
    Math.round(
      result.employeeSummaries.reduce((sum, s) => sum + Math.max(0, s.overtimeHours), 0) * 10
    ) / 10;
  const extHours = externalSupportHours(result.assignments, supportIds);

  const splitCount = result.assignments.filter((a) => a.splitDay).length;
  const overtimeCount = result.employeeSummaries.filter((s) => s.overtimeHours > 0).length;
  const quality = qualityPercentsFromSolve(
    {
      coverageValid: result.coverageValid,
      slotViolationCount: result.slotViolations.length,
      splitCount,
      overtimeCount,
      externalSupportCount: result.assignments.filter(
        (a) =>
          (a.isExternalSupport || supportIds.has(a.empId)) &&
          a.shiftKind !== 'Off' &&
          a.shiftKind !== 'Leave'
      ).length,
    },
    result.fairnessScore
  );

  const simulationResult: ScenarioSimulationResult = {
    coverageValid: result.coverageValid,
    slotViolations: result.slotViolations.length,
    missingHours,
    bridgeCount,
    overtimeHours,
    externalSupportHours: extHours,
    weeklyOffMoves: spec.weeklyOffMoves,
    fairnessHealth: quality.fairnessHealthPercent,
    staffAvailabilityHealth: quality.staffAvailabilityPercent,
    constraintHealth: quality.constraintHealthPercent,
    scheduleQuality: quality.scheduleQualityPercent,
    solverStatus: result.solverStatus,
    analysisStatus: analysis.status,
  };

  const scoreBreakdown = scoreScenario({
    coverageValid: result.coverageValid,
    slotViolations: result.slotViolations.length,
    missingHours,
    overtimeHours,
    bridgeCount,
    externalSupportHours: extHours,
    weeklyOffMoves: spec.weeklyOffMoves,
    fairnessHealth: quality.fairnessHealthPercent,
    actionCount: spec.actions.length,
    maxBridgesPerEmployee: maxPerEmployee,
    isHybrid: spec.type === 'HYBRID',
  });

  const compensationLedger = buildCompensationLedger(result.assignments, overtimeByEmp, lastByDate);
  const affectedDays = Array.from(
    new Set(spec.actions.map((a) => a.date).filter((d): d is string => Boolean(d)))
  );

  return {
    id: spec.id,
    title: spec.title,
    type: spec.type,
    description: spec.description,
    actions: spec.actions,
    simulationResult,
    score: scoreBreakdown.total,
    scoreBreakdown,
    pros: [],
    cons: [],
    explanation: spec.explanation,
    affectedDays,
    compensationLedger,
    remainingViolations: result.slotViolations,
    previewAssignments: slimAssignments(result.assignments, supportIds),
  };
}

function buildProsCons(
  scenario: SimulatedScenario,
  baseline: ScenarioSimulationResult | null
): { pros: string[]; cons: string[] } {
  const r = scenario.simulationResult;
  const pros: string[] = [];
  const cons: string[] = [];

  if (r.coverageValid) {
    pros.push('Reaches full coverage');
  }
  if (baseline) {
    const fixed = baseline.slotViolations - r.slotViolations;
    if (fixed > 0) pros.push(`Fixes ${fixed} missing slot${fixed === 1 ? '' : 's'}`);
  }
  if (r.externalSupportHours === 0 && scenario.type !== 'BASELINE') {
    pros.push('No external support needed');
  }
  if (r.fairnessHealth >= 85) pros.push('Balanced across employees');

  const compHours = scenario.compensationLedger.reduce((s, e) => s + e.compensationOwedHours, 0);
  if (compHours > 0) cons.push(`Adds ${Math.round(compHours * 10) / 10} compensation hours`);
  if (r.bridgeCount > 0) cons.push(`Uses ${r.bridgeCount} bridge shift${r.bridgeCount === 1 ? '' : 's'}`);
  if (r.overtimeHours > 0) cons.push(`Adds ${r.overtimeHours}h overtime`);
  if (r.externalSupportHours > 0) cons.push(`Needs ${r.externalSupportHours}h external support`);
  if (r.weeklyOffMoves > 0) cons.push(`Moves ${r.weeklyOffMoves} weekly off`);
  if (scenario.type === 'REDUCE_LATE_COVERAGE') cons.push('Requires policy relaxation approval');
  if (!r.coverageValid) cons.push(`Still ${r.slotViolations} slot${r.slotViolations === 1 ? '' : 's'} uncovered`);

  if (pros.length === 0) pros.push('No structural changes required');
  return { pros, cons };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Simulate alternative workforce strategies, score them, and return ranked options.
 * Never mutates the database — every scenario runs on a deep clone of `input`.
 */
export function simulateScheduleScenarios(
  input: GenerateScheduleInput,
  options: ScenarioSimulationOptions = {}
): ScenarioSimulationOutput {
  const startedAt = performance.now();
  const maxScenarios = Math.max(1, Math.min(options.maxScenarios ?? DEFAULT_MAX_SCENARIOS, 12));
  const maxScenarioSolveMs = options.maxScenarioSolveMs ?? DEFAULT_MAX_SCENARIO_SOLVE_MS;
  const maxSolves = Math.max(1, Math.min(options.maxSolves ?? HARD_MAX_SOLVES, HARD_MAX_SOLVES));
  const forcePartialSolve = options.forcePartialSolve ?? true;
  // Overall wall-clock budget for the whole simulation loop.
  const totalBudgetMs = maxScenarioSolveMs * Math.min(maxScenarios, maxSolves);

  const plan = planWeeklyResources(input);

  // Baseline is always first; alternatives ordered least → most invasive.
  const candidateSpecs: (ScenarioSpec | null)[] = [
    buildBaselineSpec(input),
    buildMoveWeeklyOffSpec(input, plan),
    buildReduceLateCoverageSpec(input, plan),
    buildBridgeSpec(input, plan),
    buildOvertimeSpec(input, plan),
    buildExternalSupportSpec(input, plan),
    buildHybridSpec(input, plan),
  ];
  const specs = candidateSpecs.filter((s): s is ScenarioSpec => s !== null).slice(0, maxScenarios);

  const scenarios: SimulatedScenario[] = [];
  let solves = 0;
  let capped = false;

  for (let i = 0; i < specs.length; i += 1) {
    const isBaseline = specs[i].type === 'BASELINE';
    // Safety caps (baseline always runs so managers see current feasibility).
    if (!isBaseline) {
      if (solves >= maxSolves) {
        capped = true;
        break;
      }
      if (performance.now() - startedAt > totalBudgetMs) {
        capped = true;
        break;
      }
    }
    const scenario = simulateSpec(specs[i], forcePartialSolve);
    solves += 1;
    scenarios.push(scenario);
  }

  const baselineResult = scenarios.find((s) => s.type === 'BASELINE')?.simulationResult ?? null;
  scenarios.forEach((s) => {
    const { pros, cons } = buildProsCons(s, s.type === 'BASELINE' ? null : baselineResult);
    s.pros = pros;
    s.cons = cons;
  });

  const ranked = rankScenarioScores(scenarios);
  const best = ranked[0];

  const feasibleScenarios = scenarios.filter((s) => s.simulationResult.coverageValid).length;
  const summary: ScenarioSimulationSummary = {
    totalScenarios: scenarios.length,
    feasibleScenarios,
    bestScore: best?.score ?? 0,
    baselineFeasible: baselineResult?.analysisStatus === 'FEASIBLE',
    baselineCoverageValid: baselineResult?.coverageValid ?? false,
    recommendation: best
      ? best.type === 'BASELINE'
        ? 'Current setup is already the strongest option.'
        : `Best option: ${best.title} (score ${best.score}).`
      : 'No scenarios could be generated.',
  };

  return {
    bestScenarioId: best?.id ?? 'baseline',
    scenarios: ranked,
    summary,
    performance: {
      scenariosGenerated: scenarios.length,
      solves,
      totalMs: Math.round(performance.now() - startedAt),
      capped,
    },
  };
}
