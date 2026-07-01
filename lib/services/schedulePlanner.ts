/**
 * Weekly schedule planner — deterministic, fairness-aware.
 * ADVISORY: produces a plan; caller applies via batch API.
 */

import type { DayCounts, GridCell, GridDay, GridRow, ScheduleGridResult } from './scheduleGrid';
import type { ShiftType } from './shift';
import { FRIDAY_DAY_OF_WEEK } from './shift';
import {
  buildEmployeeFairness,
  candidateFairnessScore,
  effectiveMinPm,
  FAIRNESS_PRESETS,
  type EmployeeFairnessRow,
  type FairnessContext,
  type FairnessWeights,
} from './schedulePlannerFairness';

export type PlanActionType = 'SHIFT_CHANGE' | 'REMOVE_COVER' | 'FORCE_WORK';

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
  type: 'AM_ON_FRIDAY' | 'AM_GT_PM' | 'PM_BELOW_MIN' | 'UNDERSTAFFED';
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
    const am = c.amCount;
    const pm = c.pmCount;
    const isFriday = day.dayOfWeek === FRIDAY_DAY_OF_WEEK;
    const minPm = effectiveMinPm(day.dayOfWeek, day.minPm ?? 0);

    if (isFriday && am > 0) {
      issues.push({
        date: day.date,
        dayIndex: i,
        type: 'AM_ON_FRIDAY',
        severity: 'critical',
        message: `Friday PM-only: AM=${am} must be 0`,
      });
    }
    if (!isFriday && am > pm) {
      issues.push({
        date: day.date,
        dayIndex: i,
        type: 'AM_GT_PM',
        severity: 'warning',
        message: `AM (${am}) exceeds PM (${pm})`,
      });
    }
    if (pm < minPm) {
      issues.push({
        date: day.date,
        dayIndex: i,
        type: 'PM_BELOW_MIN',
        severity: 'critical',
        message: `PM (${pm}) below minimum (${minPm})`,
      });
    }
    const totalWork = am + pm;
    const minStaff = minPm + (isFriday ? 0 : Math.max(day.minAm ?? 0, 0));
    if (totalWork < minStaff && pm < minPm) {
      issues.push({
        date: day.date,
        dayIndex: i,
        type: 'UNDERSTAFFED',
        severity: 'critical',
        message: `Staff shortage: need at least ${minPm} PM`,
      });
    }
  }
  return issues;
}

function issuePriority(issue: DayIssue): number {
  if (issue.type === 'AM_ON_FRIDAY') return 100;
  if (issue.type === 'PM_BELOW_MIN') return 90;
  if (issue.type === 'UNDERSTAFFED') return 85;
  if (issue.type === 'AM_GT_PM') return 50;
  return 10;
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

function findRashidPmCandidates(sim: SimCell[][], dayIndex: number): SimCell[] {
  return sim
    .map((row) => row[dayIndex])
    .filter((cell): cell is SimCell => !!cell && cell.availability === 'WORK' && cell.effectiveShift === 'COVER_RASHID_PM');
}

function findOffCandidates(sim: SimCell[][], dayIndex: number, dayOfWeek: number): SimCell[] {
  return sim
    .map((row) => row[dayIndex])
    .filter((cell): cell is SimCell => {
      if (!cell || cell.availability !== 'OFF') return false;
      if (cell.effectiveWeeklyOffDay !== 'NONE' && cell.effectiveWeeklyOffDay === dayOfWeek) return true;
      return cell.effectiveWeeklyOffDay === 'NONE' || cell.effectiveWeeklyOffDay !== dayOfWeek;
    });
}

function rankCandidates(
  candidates: SimCell[],
  rows: GridRow[],
  dayIndex: number,
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  opts?: { isWeeklyOff?: boolean; movingToPm?: boolean }
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
  const counts = recomputeCounts(sim, days.length);
  const c = counts[i];
  const isFriday = day.dayOfWeek === FRIDAY_DAY_OF_WEEK;
  const minPm = effectiveMinPm(day.dayOfWeek, day.minPm ?? 0);

  if (issue.type === 'AM_ON_FRIDAY' || issue.type === 'AM_GT_PM') {
    const candidates = rankCandidates(findAmCandidates(sim, i), rows, i, context, fairnessRows, weights, {
      movingToPm: true,
    });
    const chosen = candidates[0];
    if (!chosen) return null;
    const from = chosen.effectiveShift;
    const afterAm = c.amCount - (from === 'SPLIT' ? 1 : 1);
    const afterPm = c.pmCount + 1;
    if (!isFriday && afterPm < minPm) return null;
    if (!isFriday && afterAm > afterPm && issue.type === 'AM_GT_PM') return null;
    applyShiftChange(sim, chosen, 'EVENING');
    return {
      id: `shift-${actionIndex}-${chosen.empId}-${day.date}`,
      type: 'SHIFT_CHANGE',
      date: day.date,
      dayIndex: i,
      empId: chosen.empId,
      employeeName: chosen.name,
      fromShift: from,
      toShift: 'EVENING',
      reason: isFriday
        ? `Friday PM-only: move ${chosen.name} from ${from} to PM`
        : `Balance coverage: move ${chosen.name} AM→PM`,
      fairnessScore: candidateFairnessScore(
        chosen.empId,
        rows.find((r) => r.empId === chosen.empId)!,
        i,
        context,
        fairnessRows.find((f) => f.empId === chosen.empId),
        weights,
        { movingToPm: true }
      ),
    };
  }

  if (issue.type === 'PM_BELOW_MIN' || issue.type === 'UNDERSTAFFED') {
    const rashid = rankCandidates(findRashidPmCandidates(sim, i), rows, i, context, fairnessRows, weights);
    if (rashid.length > 0) {
      const chosen = rashid[0];
      applyShiftChange(sim, chosen, 'EVENING');
      return {
        id: `cover-${actionIndex}-${chosen.empId}-${day.date}`,
        type: 'REMOVE_COVER',
        date: day.date,
        dayIndex: i,
        empId: chosen.empId,
        employeeName: chosen.name,
        fromShift: 'COVER_RASHID_PM',
        toShift: 'EVENING',
        reason: `Convert Rashid PM cover for ${chosen.name} to boutique PM`,
        fairnessScore: candidateFairnessScore(
          chosen.empId,
          rows.find((r) => r.empId === chosen.empId)!,
          i,
          context,
          fairnessRows.find((f) => f.empId === chosen.empId),
          weights
        ),
      };
    }

    const amCandidates = rankCandidates(findAmCandidates(sim, i), rows, i, context, fairnessRows, weights, {
      movingToPm: true,
    });
    if (amCandidates.length > 0 && c.amCount > 0) {
      const chosen = amCandidates[0];
      const from = chosen.effectiveShift;
      applyShiftChange(sim, chosen, 'EVENING');
      return {
        id: `shift-pm-${actionIndex}-${chosen.empId}-${day.date}`,
        type: 'SHIFT_CHANGE',
        date: day.date,
        dayIndex: i,
        empId: chosen.empId,
        employeeName: chosen.name,
        fromShift: from,
        toShift: 'EVENING',
        reason: `Raise PM count: move ${chosen.name} to PM on ${day.date}`,
        fairnessScore: candidateFairnessScore(
          chosen.empId,
          rows.find((r) => r.empId === chosen.empId)!,
          i,
          context,
          fairnessRows.find((f) => f.empId === chosen.empId),
          weights,
          { movingToPm: true }
        ),
      };
    }

    const offCandidates = rankCandidates(
      findOffCandidates(sim, i, day.dayOfWeek),
      rows,
      i,
      context,
      fairnessRows,
      weights,
      { isWeeklyOff: true }
    );
    const offChosen = offCandidates.find((c) => c.availability === 'OFF');
    if (offChosen && !isFriday) {
      applyForceWork(sim, offChosen, 'EVENING');
      return {
        id: `force-${actionIndex}-${offChosen.empId}-${day.date}`,
        type: 'FORCE_WORK',
        date: day.date,
        dayIndex: i,
        empId: offChosen.empId,
        employeeName: offChosen.name,
        fromShift: 'OFF',
        toShift: 'EVENING',
        reason: `Emergency: force work ${offChosen.name} on weekly off day (PM shortage)`,
        fairnessScore: candidateFairnessScore(
          offChosen.empId,
          rows.find((r) => r.empId === offChosen.empId)!,
          i,
          context,
          fairnessRows.find((f) => f.empId === offChosen.empId),
          weights,
          { isWeeklyOff: true }
        ),
      };
    }
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
  const maxIterations = 28;

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
  const unresolved = sortIssues(issuesAfter.filter((x) => x.severity === 'critical'));

  const summary =
    actions.length === 0 && issuesBefore.length === 0
      ? 'No coverage issues detected for this week.'
      : actions.length === 0
        ? `Found ${issuesBefore.length} issue(s) but no automatic fix available.`
        : `Proposed ${actions.length} change(s); ${unresolved.length} critical issue(s) may remain.`;

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
    scenarios.find((s) => s.unresolved.length === 0 && s.actions.length > 0)?.id ??
    scenarios.reduce((best, s) => {
      const bestScore = best.unresolved.length * 10 + best.actions.length;
      const sScore = s.unresolved.length * 10 + s.actions.length;
      return sScore > bestScore ? s : best;
    }).id;

  return {
    weekStart: grid.weekStart,
    scenarios,
    recommendedScenarioId,
  };
}

/** Compact text summary for AI chat context. */
export function planToAiContext(plan: SchedulePlanResult, scenarioId?: string): string {
  const scenario = plan.scenarios.find((s) => s.id === (scenarioId ?? plan.recommendedScenarioId)) ?? plan.scenarios[0];
  if (!scenario) return 'No plan available.';
  const lines = [
    `Week: ${plan.weekStart}`,
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
