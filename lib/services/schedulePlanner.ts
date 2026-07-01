/**
 * Weekly schedule planner — deterministic, fairness-aware.
 * Policy: Sat–Thu AM ≥ 2, PM ≥ AM, PM ≥ 2; Friday PM-only. Split up to 2/employee/week.
 */

import type { DayCounts, GridCell, GridDay, GridRow, ScheduleGridResult } from './scheduleGrid';
import type { ShiftType } from './shift';
import {
  evaluateCoverage,
  effectiveMinAm,
  effectiveMinPm,
  isFridayDay,
  MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK,
  canProposeMorningToSplit,
  canProposeEveningToSplit,
  isCoverageCompliant,
  type CoverageViolation,
} from '@/lib/schedule/coveragePolicy';
import {
  mergeGuestCountsIntoDayCounts,
  type ExternalCandidate,
  type GuestShiftInput,
} from './schedulePlanGuests';
import {
  buildEmployeeFairness,
  candidateFairnessScore,
  FAIRNESS_PRESETS,
  type EmployeeFairnessRow,
  type FairnessContext,
  type FairnessWeights,
} from './schedulePlannerFairness';

export type PlanActionType = 'SHIFT_CHANGE' | 'REMOVE_COVER' | 'FORCE_WORK' | 'ASSIGN_SHIFT' | 'GUEST_ADD';

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
  sourceBoutiqueId?: string;
};

export type SchedulePlanOptions = {
  guestShifts?: GuestShiftInput[];
  externalCandidates?: ExternalCandidate[];
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

type SplitTracker = Map<string, number>;

function countSplitsInSim(sim: SimCell[][]): SplitTracker {
  const map: SplitTracker = new Map();
  for (const row of sim) {
    for (const cell of row) {
      if (cell?.availability === 'WORK' && cell.effectiveShift === 'SPLIT') {
        map.set(cell.empId, (map.get(cell.empId) ?? 0) + 1);
      }
    }
  }
  return map;
}

function canEmployeeTakeSplit(tracker: SplitTracker, empId: string): boolean {
  return (tracker.get(empId) ?? 0) < MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK;
}

function recordSplit(tracker: SplitTracker, empId: string): void {
  tracker.set(empId, (tracker.get(empId) ?? 0) + 1);
}

function sortByFewestSplits(candidates: SimCell[], tracker: SplitTracker): SimCell[] {
  return [...candidates].sort(
    (a, b) => (tracker.get(a.empId) ?? 0) - (tracker.get(b.empId) ?? 0)
  );
}

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

function effectiveCounts(
  sim: SimCell[][],
  days: GridDay[],
  simGuests: GuestShiftInput[]
): DayCounts[] {
  const base = recomputeCounts(sim, days.length);
  return mergeGuestCountsIntoDayCounts(base, days, simGuests);
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

function detectIssuesFromSim(sim: SimCell[][], days: GridDay[], simGuests: GuestShiftInput[]): DayIssue[] {
  return detectIssues(effectiveCounts(sim, days, simGuests), days);
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
  const candidates = rankCandidates(
    findAmCandidates(sim, dayIndex).filter(
      (c) => c.effectiveShift === 'MORNING' || c.effectiveShift === 'COVER_RASHID_AM'
    ),
    rows,
    dayIndex,
    context,
    fairnessRows,
    weights,
    { movingToPm: true }
  );
  const afterAm = counts.amCount - 1;
  const afterPm = counts.pmCount + 1;
  const moveValid = isFridayDay(day.dayOfWeek)
    ? afterAm >= 0
    : afterAm >= minAm &&
      afterPm >= afterAm &&
      afterPm >= effectiveMinPm(day.dayOfWeek, day.minPm ?? 0);
  const chosen = moveValid ? candidates[0] : undefined;
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

function tryAssignNoneToPm(
  sim: SimCell[][],
  day: GridDay,
  dayIndex: number,
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number
): PlanAction | null {
  const candidates = rankCandidates(findNoneCandidates(sim, dayIndex), rows, dayIndex, context, fairnessRows, weights, {
    movingToPm: true,
  });
  const chosen = candidates[0];
  if (!chosen) return null;
  applyShiftChange(sim, chosen, 'EVENING');
  return makeAction(
    actionIndex,
    'ASSIGN_SHIFT',
    day,
    dayIndex,
    chosen,
    'NONE',
    'EVENING',
    `Assign ${chosen.name} to PM (minimum ${effectiveMinPm(day.dayOfWeek, day.minPm ?? 0)} required)`,
    rows,
    context,
    fairnessRows,
    weights,
    { movingToPm: true }
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
  if (afterPm < minPm || afterPm < afterAm) return null;
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
    `Move ${chosen.name} PM→AM to reach minimum AM while keeping PM ≥ AM`,
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
  if (shift === 'MORNING' && !isFridayDay(day.dayOfWeek) && counts.amCount + 1 > counts.pmCount) return null;
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

function tryMorningToSplit(
  sim: SimCell[][],
  day: GridDay,
  dayIndex: number,
  days: GridDay[],
  simGuests: GuestShiftInput[],
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number,
  splitTracker: SplitTracker
): PlanAction | null {
  if (isFridayDay(day.dayOfWeek)) return null;
  const counts = effectiveCounts(sim, days, simGuests)[dayIndex];
  const cover = { am: counts.amCount, pm: counts.pmCount };
  if (!canProposeMorningToSplit(cover, day.dayOfWeek, day.minAm ?? 0, day.minPm ?? 0)) {
    return null;
  }
  const morningCells = sim
    .map((row) => row[dayIndex])
    .filter(
      (cell): cell is SimCell =>
        !!cell && cell.availability === 'WORK' && cell.effectiveShift === 'MORNING' && canEmployeeTakeSplit(splitTracker, cell.empId)
    );
  const candidates = rankCandidates(
    sortByFewestSplits(morningCells, splitTracker),
    rows,
    dayIndex,
    context,
    fairnessRows,
    weights
  );
  const chosen = candidates[0];
  if (!chosen) return null;
  applyShiftChange(sim, chosen, 'SPLIT');
  recordSplit(splitTracker, chosen.empId);
  return makeAction(
    actionIndex,
    'SHIFT_CHANGE',
    day,
    dayIndex,
    chosen,
    'MORNING',
    'SPLIT',
    `Split: ${chosen.name} AM→Split (adds PM; max ${MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK}/week per employee)`,
    rows,
    context,
    fairnessRows,
    weights
  );
}

function tryEveningToSplit(
  sim: SimCell[][],
  day: GridDay,
  dayIndex: number,
  days: GridDay[],
  simGuests: GuestShiftInput[],
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number,
  splitTracker: SplitTracker
): PlanAction | null {
  if (isFridayDay(day.dayOfWeek)) return null;
  const counts = effectiveCounts(sim, days, simGuests)[dayIndex];
  const cover = { am: counts.amCount, pm: counts.pmCount };
  if (!canProposeEveningToSplit(cover, day.dayOfWeek, day.minAm ?? 0)) return null;
  const pmCells = sim
    .map((row) => row[dayIndex])
    .filter(
      (cell): cell is SimCell =>
        !!cell && cell.availability === 'WORK' && cell.effectiveShift === 'EVENING' && canEmployeeTakeSplit(splitTracker, cell.empId)
    );
  const candidates = rankCandidates(
    sortByFewestSplits(pmCells, splitTracker),
    rows,
    dayIndex,
    context,
    fairnessRows,
    weights
  );
  const chosen = candidates[0];
  if (!chosen) return null;
  applyShiftChange(sim, chosen, 'SPLIT');
  recordSplit(splitTracker, chosen.empId);
  return makeAction(
    actionIndex,
    'SHIFT_CHANGE',
    day,
    dayIndex,
    chosen,
    'EVENING',
    'SPLIT',
    `Split: ${chosen.name} PM→Split (reach AM ≥ 2; max ${MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK}/week per employee)`,
    rows,
    context,
    fairnessRows,
    weights
  );
}

/** After policy is met, convert AM→Split where allowed to maximize split usage fairly. */
function tryExpandSplitUsage(
  sim: SimCell[][],
  days: GridDay[],
  simGuests: GuestShiftInput[],
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  splitTracker: SplitTracker,
  actionIndex: number
): PlanAction | null {
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex];
    if (isFridayDay(day.dayOfWeek)) continue;
    const counts = effectiveCounts(sim, days, simGuests)[dayIndex];
    const cover = { am: counts.amCount, pm: counts.pmCount };
    if (!isCoverageCompliant(cover, day.dayOfWeek, day.minAm ?? 0, day.minPm ?? 0)) continue;
    if (!canProposeMorningToSplit(cover, day.dayOfWeek, day.minAm ?? 0, day.minPm ?? 0)) continue;
    const action = tryMorningToSplit(
      sim,
      day,
      dayIndex,
      days,
      simGuests,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      splitTracker
    );
    if (action) return action;
  }
  return null;
}

function guestShiftForIssue(issue: DayIssue, day: GridDay): 'MORNING' | 'EVENING' {
  if (isFridayDay(day.dayOfWeek)) return 'EVENING';
  if (issue.type === 'AM_BELOW_MIN') return 'MORNING';
  return 'EVENING';
}

function tryAddExternalGuest(
  issue: DayIssue,
  day: GridDay,
  dayIndex: number,
  simGuests: GuestShiftInput[],
  externalCandidates: ExternalCandidate[],
  actionIndex: number
): PlanAction | null {
  if (!externalCandidates.length) return null;
  const date = day.date;
  const busy = new Set(simGuests.filter((g) => g.date === date).map((g) => g.empId));
  const weekUse = new Map<string, number>();
  for (const g of simGuests) {
    weekUse.set(g.empId, (weekUse.get(g.empId) ?? 0) + 1);
  }
  const candidate = [...externalCandidates]
    .filter((c) => !busy.has(c.empId))
    .sort((a, b) => (weekUse.get(a.empId) ?? 0) - (weekUse.get(b.empId) ?? 0))[0];
  if (!candidate) return null;
  const shift = guestShiftForIssue(issue, day);
  simGuests.push({
    empId: candidate.empId,
    employeeName: candidate.name,
    date,
    shift,
    sourceBoutiqueId: candidate.boutiqueId,
  });
  return {
    id: `guest-${actionIndex}-${candidate.empId}-${date}`,
    type: 'GUEST_ADD',
    date,
    dayIndex,
    empId: candidate.empId,
    employeeName: candidate.name,
    fromShift: 'EXTERNAL',
    toShift: shift,
    reason: `Add external coverage: ${candidate.name} (${candidate.boutiqueName}) on ${shift}`,
    fairnessScore: weekUse.get(candidate.empId) ?? 0,
    sourceBoutiqueId: candidate.boutiqueId,
  };
}

function tryFixIssue(
  issue: DayIssue,
  sim: SimCell[][],
  days: GridDay[],
  simGuests: GuestShiftInput[],
  externalCandidates: ExternalCandidate[],
  splitTracker: SplitTracker,
  rows: GridRow[],
  context: FairnessContext,
  fairnessRows: EmployeeFairnessRow[],
  weights: FairnessWeights,
  actionIndex: number
): PlanAction | null {
  const i = issue.dayIndex;
  const day = days[i];

  if (issue.type === 'AM_ON_FRIDAY') {
    const moved = tryMoveAmToPm(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      `Friday PM-only: move AM to PM`
    );
    if (moved) return moved;
    const splitCandidates = rankCandidates(
      sim
        .map((row) => row[i])
        .filter((cell): cell is SimCell => !!cell && cell.availability === 'WORK' && cell.effectiveShift === 'SPLIT'),
      rows,
      i,
      context,
      fairnessRows,
      weights,
      { movingToPm: true }
    );
    const splitChosen = splitCandidates[0];
    if (splitChosen) {
      applyShiftChange(sim, splitChosen, 'EVENING');
      return makeAction(
        actionIndex,
        'SHIFT_CHANGE',
        day,
        i,
        splitChosen,
        'SPLIT',
        'EVENING',
        `Friday PM-only: move ${splitChosen.name} from Split to PM`,
        rows,
        context,
        fairnessRows,
        weights,
        { movingToPm: true }
      );
    }
    return null;
  }

  if (issue.type === 'PM_NOT_ABOVE_AM') {
    const assigned = tryAssignNoneToPm(sim, day, i, rows, context, fairnessRows, weights, actionIndex);
    if (assigned) return assigned;

    const split = tryMorningToSplit(
      sim,
      day,
      i,
      days,
      simGuests,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      splitTracker
    );
    if (split) return split;

    const moved = tryMoveAmToPm(
      sim,
      day,
      i,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      `PM must be ≥ AM: move one employee AM→PM`
    );
    if (moved) return moved;
    const guest = tryAddExternalGuest(issue, day, i, simGuests, externalCandidates, actionIndex);
    if (guest) return guest;
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
      `PM must be ≥ AM: add PM via force work on off day`
    );
  }

  if (issue.type === 'AM_BELOW_MIN') {
    const assigned = tryAssignNoneToAm(sim, day, i, rows, context, fairnessRows, weights, actionIndex);
    if (assigned) return assigned;
    const moved = tryMovePmToAm(sim, day, i, rows, context, fairnessRows, weights, actionIndex);
    if (moved) return moved;
    const split = tryEveningToSplit(
      sim,
      day,
      i,
      days,
      simGuests,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      splitTracker
    );
    if (split) return split;
    const guest = tryAddExternalGuest(issue, day, i, simGuests, externalCandidates, actionIndex);
    if (guest) return guest;
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
    const assigned = tryAssignNoneToPm(sim, day, i, rows, context, fairnessRows, weights, actionIndex);
    if (assigned) return assigned;

    const splitPm = tryMorningToSplit(
      sim,
      day,
      i,
      days,
      simGuests,
      rows,
      context,
      fairnessRows,
      weights,
      actionIndex,
      splitTracker
    );
    if (splitPm) return splitPm;

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

    const guest = tryAddExternalGuest(issue, day, i, simGuests, externalCandidates, actionIndex);
    if (guest) return guest;

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
  weights: FairnessWeights,
  planOptions: SchedulePlanOptions = {}
): SchedulePlanScenario {
  const sim = cloneSim(grid.rows);
  const simGuests: GuestShiftInput[] = [...(planOptions.guestShifts ?? [])];
  const externalCandidates = planOptions.externalCandidates ?? [];
  const splitTracker = countSplitsInSim(sim);
  const countsBefore = effectiveCounts(sim, grid.days, simGuests);
  const issuesBefore = detectIssues(countsBefore, grid.days);
  const fairness = buildEmployeeFairness(grid.rows, context);
  const actions: PlanAction[] = [];
  let iterations = 0;
  const maxIterations = 56;

  while (iterations < maxIterations) {
    const issues = sortIssues(detectIssuesFromSim(sim, grid.days, simGuests));
    if (issues.length === 0) break;

    const top = issues[0];
    const action = tryFixIssue(
      top,
      sim,
      grid.days,
      simGuests,
      externalCandidates,
      splitTracker,
      grid.rows,
      context,
      fairness,
      weights,
      actions.length
    );
    if (!action) break;
    actions.push(action);
    iterations++;
  }

  while (iterations < maxIterations) {
    const expanded = tryExpandSplitUsage(
      sim,
      grid.days,
      simGuests,
      grid.rows,
      context,
      fairness,
      weights,
      splitTracker,
      actions.length
    );
    if (!expanded) break;
    actions.push(expanded);
    iterations++;
  }

  while (iterations < maxIterations) {
    const issues = sortIssues(detectIssuesFromSim(sim, grid.days, simGuests));
    if (issues.length === 0) break;

    const top = issues[0];
    const action = tryFixIssue(
      top,
      sim,
      grid.days,
      simGuests,
      externalCandidates,
      splitTracker,
      grid.rows,
      context,
      fairness,
      weights,
      actions.length
    );
    if (!action) break;
    actions.push(action);
    iterations++;
  }

  const countsAfter = effectiveCounts(sim, grid.days, simGuests);
  const issuesAfter = detectIssues(countsAfter, grid.days);
  const unresolved = sortIssues(issuesAfter);

  const guestNote =
    externalCandidates.length > 0 ? ' External staff may be added when needed.' : '';
  const summary =
    actions.length === 0 && issuesBefore.length === 0
      ? `Schedule meets policy (AM ≥ 2, PM ≥ AM Sat–Thu, Friday PM-only).${guestNote}`
      : actions.length === 0
        ? `Found ${issuesBefore.length} issue(s) but no automatic fix available.${guestNote}`
        : `Proposed ${actions.length} change(s); ${unresolved.length} issue(s) may remain.${guestNote}`;

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

export function buildSchedulePlan(
  grid: ScheduleGridResult,
  context: FairnessContext,
  planOptions: SchedulePlanOptions = {}
): SchedulePlanResult {
  const scenarios = Object.entries(FAIRNESS_PRESETS).map(([id, preset]) =>
    buildScenario(grid, context, id, preset.labelKey, preset.weights, planOptions)
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
    `Policy: Sat–Thu AM ≥ 2, PM ≥ AM, PM ≥ 2; Friday PM-only; Split max ${MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK}/employee/week.`,
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
