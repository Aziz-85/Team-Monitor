/**
 * Weekly schedule planner — deterministic, fairness-aware.
 * Policy: Sat–Thu min 2 AM + min 2 PM, PM > AM; Friday PM-only.
 */

import type { DayCounts, GridCell, GridDay, GridRow, ScheduleGridResult } from './scheduleGrid';
import type { ShiftType } from './shift';
import {
  evaluateCoverage,
  effectiveMinAm,
  effectiveMinPm,
  isFridayDay,
  type CoverageViolation,
} from '@/lib/schedule/coveragePolicy';
import {
  buildEmployeeFairness,
  candidateFairnessScore,
  FAIRNESS_PRESETS,
  type EmployeeFairnessRow,
  type FairnessContext,
  type FairnessWeights,
} from './schedulePlannerFairness';

export type PlanActionType = 'SHIFT_CHANGE' | 'REMOVE_COVER' | 'FORCE_WORK' | 'ASSIGN_SHIFT';

export type PlanAction = {
  id: string;
  type: PlanActionType;
  date: string;
  dayIndex: number;
  empId: string;
  employeeName: string;
  fromShift: string;
  toShift: string;
  reason: string;
  fairnessScore: number;
};

export type DayIssue = {
  date: string;
  dayIndex: number;
  type: CoverageViolation;
  severity: 'critical' | 'warning';
  message: string;
};

export type SchedulePlanScenario = {
  id: string;
  labelKey: string;
  actions: PlanAction[];
  issuesBefore: DayIssue[];
  issuesAfter: DayIssue[];
  unresolved: DayIssue[];
  countsBefore: DayCounts[];
  countsAfter: DayCounts[];
  fairness: EmployeeFairnessRow[];
  summary: string;
};

export type SchedulePlanResult = {
  weekStart: string;
  scenarios: SchedulePlanScenario[];
  recommendedScenarioId: string;
};

type SimCell = GridCell & { empId: string; name: string; effectiveWeeklyOffDay: number | 'NONE' };

function cloneSim(rows: GridRow[]): SimCell[][] {
  return rows.map((row) =>
    row.cells.map((cell) => ({
      ...cell,
      empId: row.empId,
      name: row.name,
      effectiveWeeklyOffDay: row.effectiveWeeklyOffDay ?? 'NONE',
    }))
  );
}

function recomputeCounts(sim: SimCell[][], dayCount: number): DayCounts[] {
  const counts: DayCounts[] = Array.from({ length: dayCount }, () => ({
    amCount: 0,
    pmCount: 0,
    rashidAmCount: 0,
    rashidPmCount: 0,
  }));
  for (const row of sim) {
    for (let i = 0; i < dayCount; i++) {
      const cell = row[i];
      if (!cell || cell.availability !== 'WORK') continue;
      const day = counts[i];
      const s = cell.effectiveShift;
      if (s === 'MORNING') day.amCount++;
      else if (s === 'EVENING') day.pmCount++;
      else if (s === 'SPLIT') {
        day.amCount++;
        day.pmCount++;
      } else if (s === 'COVER_RASHID_AM') day.rashidAmCount++;
      else if (s === 'COVER_RASHID_PM') day.rashidPmCount++;
    }
  }
  return counts;
}

function detectIssues(counts: DayCounts[], days: GridDay[]): DayIssue[] {
  const issues: DayIssue[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const c = counts[i] ?? { amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 };
    const evaluated = evaluateCoverage(
      { am: c.amCount, pm: c.pmCount },
      day.dayOfWeek,
      day.minAm ?? 0,
      day.minPm ?? 0
    );
    for (const issue of evaluated) {
      issues.push({
        date: day.date,
        dayIndex: i,
        type: issue.type,
        severity: issue.severity,
        message: issue.message,
      });
    }
  }
  return issues;
}

function issuePriority(issue: DayIssue): number {
  switch (issue.type) {
    case 'AM_ON_FRIDAY':
      return 100;
    case 'AM_BELOW_MIN':
      return 95;
    case 'PM_BELOW_MIN':
      return 90;
    case 'PM_NOT_ABOVE_AM':
      return 85;
    default:
      return 10;
  }
}

function sortIssues(issues: DayIssue[]): DayIssue[] {
  return [...issues].sort((a, b) => issuePriority(b) - issuePriority(a));
}

function findAmCandidates(sim: SimCell[][], dayIndex: number): SimCell[] {
  return sim
    .map((row) => row[dayIndex])
    .filter(
      (cell): cell is SimCell =>
        !!cell &&
        cell.availability === 'WORK' &&
        (cell.effectiveShift === 'MORNING' ||
          cell.effectiveShift === 'SPLIT' ||
          cell.effectiveShift === 'COVER_RASHID_AM')
    );
}

function findPmCandidates(sim: SimCell[][], dayIndex: number): SimCell[] {
  return sim
    .map((row) => row[dayIndex])
    .filter(
      (cell): cell is SimCell =>
        !!cell && cell.availability === 'WORK' && cell.effectiveShift === 'EVENING'
    );
}

function findNoneCandidates(sim: SimCell[][], dayIndex: number): SimCell[] {
  return sim
    .map((row) => row[dayIndex])
    .filter((cell): cell is SimCell => !!cell && cell.availability === 'WORK' && cell.effectiveShift === 'NONE');
}

function findRashidPmCandidates(sim: SimCell[][], dayIndex: number): SimCell[] {
  return sim
    .map((row) => row[dayIndex])
    .filter((cell): cell is SimCell => !!cell && cell.availability === 'WORK' && cell.effectiveShift === 'COVER_RASHID_PM');
}

function findOffCandidates(sim: SimCell[][], dayIndex: number): SimCell[] {
  return sim.map((row) => row[dayIndex]).filter((cell): cell is SimCell => !!cell && cell.availability === 'OFF');
}

function rankCandidates(
  candidates: SimCell[],
  rows: GridRow[],
  dayIndex: number,
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  opts?: { isWeeklyOff?: boolean; movingToPm?: boolean; movingToAm?: boolean }
): SimCell[] {
  const fairnessByEmp = new Map(fairnessRows.map((f) => [f.empId, f]));
  return [...candidates].sort((a, b) => {
    const rowA = rows.find((r) => r.empId === a.empId)!;
    const rowB = rows.find((r) => r.empId === b.empId)!;
    const scoreA = candidateFairnessScore(a.empId, rowA, dayIndex, context, fairnessByEmp.get(a.empId), weights, opts);
    const scoreB = candidateFairnessScore(b.empId, rowB, dayIndex, context, fairnessByEmp.get(b.empId), weights, opts);
    return scoreA - scoreB;
  });
}

function applyShiftChange(_sim: SimCell[][], cell: SimCell, toShift: string): void {
  cell.effectiveShift = toShift as ShiftType;
}

function applyForceWork(_sim: SimCell[][], cell: SimCell, shift: string): void {
  cell.availability = 'WORK';
  cell.effectiveShift = shift as ShiftType;
}

function makeAction(
  actionIndex: number,
  type: PlanActionType,
  day: GridDay,
  dayIndex: number,
  chosen: SimCell,
  fromShift: string,
  toShift: string,
  reason: string,
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  opts?: { isWeeklyOff?: boolean; movingToPm?: boolean; movingToAm?: boolean }
): PlanAction {
  return {
    id: `${type.toLowerCase()}-${actionIndex}-${chosen.empId}-${day.date}`,
    type,
    date: day.date,
    dayIndex,
    empId: chosen.empId,
    employeeName: chosen.name,
    fromShift,
    toShift,
    reason,
    fairnessScore: candidateFairnessScore(
      chosen.empId,
      rows.find((r) => r.empId === chosen.empId)!,
      dayIndex,
      context,
      fairnessRows.find((f) => f.empId === chosen.empId),
      weights,
      opts
    ),
  };
}

function tryMoveAmToPm(
  sim: SimCell[][],
  day: GridDay,
  dayIndex: number,
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number,
  reason: string
): PlanAction | null {
  const counts = recomputeCounts(sim, rows[0]?.cells.length ?? 7)[dayIndex];
  const minAm = effectiveMinAm(day.dayOfWeek, day.minAm ?? 0);
  const candidates = rankCandidates(findAmCandidates(sim, dayIndex), rows, dayIndex, context, fairnessRows, weights, {
    movingToPm: true,
  });
  const chosen = candidates.find((c) => {
    const from = c.effectiveShift;
    const amDelta = from === 'SPLIT' ? 1 : 1;
    const afterAm = counts.amCount - amDelta;
    const afterPm = counts.pmCount + 1;
    if (isFridayDay(day.dayOfWeek)) return afterAm >= 0;
    if (afterAm < minAm) return false;
    if (afterPm <= afterAm) return false;
    return afterPm >= effectiveMinPm(day.dayOfWeek, day.minPm ?? 0);
  });
  if (!chosen) return null;
  const from = chosen.effectiveShift;
  applyShiftChange(sim, chosen, 'EVENING');
  return makeAction(actionIndex, 'SHIFT_CHANGE', day, dayIndex, chosen, from, 'EVENING', reason, rows, context, fairnessRows, weights, {
    movingToPm: true,
  });
}

function tryAssignNoneToAm(
  sim: SimCell[][],
  day: GridDay,
  dayIndex: number,
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number
): PlanAction | null {
  const counts = recomputeCounts(sim, rows[0]?.cells.length ?? 7)[dayIndex];
  const afterAm = counts.amCount + 1;
  if (!isFridayDay(day.dayOfWeek) && afterAm >= counts.pmCount) return null;
  const candidates = rankCandidates(findNoneCandidates(sim, dayIndex), rows, dayIndex, context, fairnessRows, weights, {
    movingToAm: true,
  });
  const chosen = candidates[0];
  if (!chosen) return null;
  applyShiftChange(sim, chosen, 'MORNING');
  return makeAction(
    actionIndex,
    'ASSIGN_SHIFT',
    day,
    dayIndex,
    chosen,
    'NONE',
    'MORNING',
    `Assign ${chosen.name} to AM (minimum ${effectiveMinAm(day.dayOfWeek, day.minAm ?? 0)} required)`,
    rows,
    context,
    fairnessRows,
    weights,
    { movingToAm: true }
  );
}

function tryMovePmToAm(
  sim: SimCell[][],
  day: GridDay,
  dayIndex: number,
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number
): PlanAction | null {
  const counts = recomputeCounts(sim, rows[0]?.cells.length ?? 7)[dayIndex];
  const minPm = effectiveMinPm(day.dayOfWeek, day.minPm ?? 0);
  const afterAm = counts.amCount + 1;
  const afterPm = counts.pmCount - 1;
  if (afterPm < minPm || afterPm <= afterAm) return null;
  const candidates = rankCandidates(findPmCandidates(sim, dayIndex), rows, dayIndex, context, fairnessRows, weights, {
    movingToAm: true,
  });
  const chosen = candidates[0];
  if (!chosen) return null;
  applyShiftChange(sim, chosen, 'MORNING');
  return makeAction(
    actionIndex,
    'SHIFT_CHANGE',
    day,
    dayIndex,
    chosen,
    'EVENING',
    'MORNING',
    `Move ${chosen.name} PM→AM to reach minimum AM while keeping PM > AM`,
    rows,
    context,
    fairnessRows,
    weights,
    { movingToAm: true }
  );
}

function tryForceWork(
  sim: SimCell[][],
  day: GridDay,
  dayIndex: number,
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number,
  shift: 'MORNING' | 'EVENING',
  reason: string
): PlanAction | null {
  const counts = recomputeCounts(sim, rows[0]?.cells.length ?? 7)[dayIndex];
  if (shift === 'MORNING' && isFridayDay(day.dayOfWeek)) return null;
  if (shift === 'MORNING' && counts.amCount + 1 >= counts.pmCount) return null;
  const candidates = rankCandidates(findOffCandidates(sim, dayIndex), rows, dayIndex, context, fairnessRows, weights, {
    isWeeklyOff: true,
    movingToAm: shift === 'MORNING',
    movingToPm: shift === 'EVENING',
  });
  const chosen = candidates[0];
  if (!chosen) return null;
  applyForceWork(sim, chosen, shift);
  return makeAction(actionIndex, 'FORCE_WORK', day, dayIndex, chosen, 'OFF', shift, reason, rows, context, fairnessRows, weights, {
    isWeeklyOff: true,
    movingToAm: shift === 'MORNING',
    movingToPm: shift === 'EVENING',
  });
}

function tryFixIssue(
  issue: DayIssue,
  sim: SimCell[][],
  days: GridDay[],
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number
): PlanAction | null {
  const i = issue.dayIndex;
  const day = days[i];

  if (issue.type === 'AM_ON_FRIDAY') {
    return tryMoveAmToPm(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      `Friday PM-only: move ${issue.message.includes('AM') ? 'AM/Split' : 'shift'} to PM`
    );
  }

  if (issue.type === 'PM_NOT_ABOVE_AM') {
    const moved = tryMoveAmToPm(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      `PM must exceed AM: move one employee AM→PM`
    );
    if (moved) return moved;
    return tryForceWork(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      'EVENING',
      `PM must exceed AM: add PM via force work on off day`
    );
  }

  if (issue.type === 'AM_BELOW_MIN') {
    const assigned = tryAssignNoneToAm(sim, day, i, rows, context, fairnessRows, weights, actionIndex);
    if (assigned) return assigned;
    const moved = tryMovePmToAm(sim, day, i, rows, context, fairnessRows, weights, actionIndex);
    if (moved) return moved;
    return tryForceWork(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      'MORNING',
      `Minimum AM staff: force work on off day`
    );
  }

  if (issue.type === 'PM_BELOW_MIN') {
    const rashid = rankCandidates(findRashidPmCandidates(sim, i), rows, i, context, fairnessRows, weights);
    if (rashid.length > 0) {
      const chosen = rashid[0];
      applyShiftChange(sim, chosen, 'EVENING');
      return makeAction(
        actionIndex,
        'REMOVE_COVER',
        day,
        i,
        chosen,
        'COVER_RASHID_PM',
        'EVENING',
        `Convert Rashid PM cover for ${chosen.name} to boutique PM`,
        rows,
        context,
        fairnessRows,
        weights
      );
    }

    const moved = tryMoveAmToPm(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      `Raise PM to minimum ${effectiveMinPm(day.dayOfWeek, day.minPm ?? 0)}`
    );
    if (moved) return moved;

    return tryForceWork(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      'EVENING',
      `Minimum PM staff: force work on off day`
    );
  }

  return null;
}

function buildScenario(
  grid: ScheduleGridResult,
  context: FairnessContext,
  scenarioId: string,
  labelKey: string,
  weights: FairnessWeights
): SchedulePlanScenario {
  const sim = cloneSim(grid.rows);
  const countsBefore = grid.counts.map((c) => ({ ...c }));
  const issuesBefore = detectIssues(countsBefore, grid.days);
  const fairness = buildEmployeeFairness(grid.rows, context);
  const actions: PlanAction[] = [];
  let iterations = 0;
  const maxIterations = 42;

  while (iterations < maxIterations) {
    const currentCounts = recomputeCounts(sim, grid.days.length);
    const issues = sortIssues(detectIssues(currentCounts, grid.days));
    if (issues.length === 0) break;

    const top = issues[0];
    const action = tryFixIssue(top, sim, grid.days, grid.rows, context, fairness, weights, actions.length);
    if (!action) break;
    actions.push(action);
    iterations++;
  }

  const countsAfter = recomputeCounts(sim, grid.days.length);
  const issuesAfter = detectIssues(countsAfter, grid.days);
  const unresolved = sortIssues(issuesAfter);

  const summary =
    actions.length === 0 && issuesBefore.length === 0
      ? 'Schedule meets policy: min 2 per shift (Sat–Thu), PM > AM, Friday PM-only.'
      : actions.length === 0
        ? `Found ${issuesBefore.length} issue(s) but no automatic fix available.`
        : `Proposed ${actions.length} change(s); ${unresolved.length} issue(s) may remain.`;

  return {
    id: scenarioId,
    labelKey,
    actions,
    issuesBefore,
    issuesAfter,
    unresolved,
    countsBefore,
    countsAfter,
    fairness,
    summary,
  };
}

export function buildSchedulePlan(grid: ScheduleGridResult, context: FairnessContext): SchedulePlanResult {
  const scenarios = Object.entries(FAIRNESS_PRESETS).map(([id, preset]) =>
    buildScenario(grid, context, id, preset.labelKey, preset.weights)
  );

  const recommendedScenarioId =
    scenarios.find((s) => s.unresolved.length === 0)?.id ??
    scenarios.reduce((best, s) => {
      const bestScore = best.unresolved.length * 10 - best.actions.length;
      const sScore = s.unresolved.length * 10 - s.actions.length;
      return sScore < bestScore ? s : best;
    }).id;

  return {
    weekStart: grid.weekStart,
    scenarios,
    recommendedScenarioId,
  };
}

export function planToAiContext(plan: SchedulePlanResult, scenarioId?: string): string {
  const scenario = plan.scenarios.find((s) => s.id === (scenarioId ?? plan.recommendedScenarioId)) ?? plan.scenarios[0];
  if (!scenario) return 'No plan available.';
  const lines = [
    `Week: ${plan.weekStart}`,
    `Policy: Sat–Thu min 2 AM + min 2 PM, PM > AM; Friday PM-only.`,
    `Scenario: ${scenario.id}`,
    `Summary: ${scenario.summary}`,
    `Issues before: ${scenario.issuesBefore.map((i) => i.message).join('; ') || 'none'}`,
    `Proposed actions (${scenario.actions.length}):`,
    ...scenario.actions.map(
      (a) => `- ${a.date}: ${a.employeeName} ${a.fromShift}→${a.toShift} (${a.type}) — ${a.reason}`
    ),
    `Unresolved: ${scenario.unresolved.map((i) => i.message).join('; ') || 'none'}`,
    'Fairness load (top 5):',
    ...[...scenario.fairness]
      .sort((a, b) => b.loadScore - a.loadScore)
      .slice(0, 5)
      .map((f) => `- ${f.name}: PM=${f.pmDays} AM=${f.amDays} overrides=${f.monthlyOverrides} load=${f.loadScore.toFixed(1)}`),
  ];
  return lines.join('\n');
}
