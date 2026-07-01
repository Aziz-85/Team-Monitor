/**
 * Bridge dynamic generate engine to SchedulePlanResult for the schedule assistant UI.
 */

import type { ScheduleGridResult, DayCounts } from '@/lib/services/scheduleGrid';
import { buildDayCountContexts, computeCountsFromGridRows } from '@/lib/services/scheduleGrid';
import type { GuestShiftInput } from '@/lib/services/schedulePlanGuests';
import type { FairnessContext } from '@/lib/services/schedulePlannerFairness';
import { buildEmployeeFairness } from '@/lib/services/schedulePlannerFairness';
import type { SchedulePlanResult, SchedulePlanScenario, DayIssue, PlanAction } from '@/lib/services/schedulePlanner';
import { getRamadanRange } from '@/lib/time/ramadan';
import { buildGenerateScheduleInput } from './buildInput';
import { generateSchedule } from './engine';
import { generateResultToPlanActions } from './toPlanActions';
import { incrementCountsFromShiftCoverage } from '@/lib/schedule/segmentCoverage';

function slotViolationsToIssues(
  violations: import('./types').SlotViolation[],
  dayIndexByDate: Map<string, number>
): DayIssue[] {
  return violations.map((v) => ({
    date: v.date,
    dayIndex: dayIndexByDate.get(v.date) ?? 0,
    type: 'PM_BELOW_MIN' as const,
    severity: 'critical' as const,
    message: `Slot ${v.startTime}–${v.endTime}: coverage ${v.coverage} < ${v.minCoverage}`,
  }));
}

function simulateCountsAfterActions(
  grid: ScheduleGridResult,
  actions: PlanAction[]
): DayCounts[] {
  const dayCountContexts = buildDayCountContexts(grid.days.map((d) => d.date));
  const actionByKey = new Map(actions.map((a) => [`${a.empId}|${a.date}`, a]));

  const rows = grid.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => {
      const action = actionByKey.get(`${row.empId}|${cell.date}`);
      if (!action || cell.availability !== 'WORK') return cell;
      return { ...cell, effectiveShift: action.toShift as typeof cell.effectiveShift };
    }),
  }));

  const rosterBefore = computeCountsFromGridRows(grid.rows, (_e, _d, s) => s, dayCountContexts);

  return dayCountContexts.map((ctx, i) => {
    const refined: DayCounts = { amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 };
    for (const row of rows) {
      const cell = row.cells[i];
      if (cell.availability !== 'WORK') continue;
      const action = actionByKey.get(`${row.empId}|${cell.date}`);
      incrementCountsFromShiftCoverage(
        refined,
        cell.effectiveShift,
        ctx.operatingPeriods,
        ctx.dayOfWeek,
        ctx.isRamadan,
        ctx.maxDailyHours,
        action?.segments
      );
    }
    const guestAm = grid.counts[i].amCount - rosterBefore[i].amCount;
    const guestPm = grid.counts[i].pmCount - rosterBefore[i].pmCount;
    return {
      amCount: refined.amCount + guestAm,
      pmCount: refined.pmCount + guestPm,
      rashidAmCount: grid.counts[i].rashidAmCount,
      rashidPmCount: grid.counts[i].rashidPmCount,
    };
  });
}

export function buildSchedulePlanFromGenerate(
  grid: ScheduleGridResult,
  context: FairnessContext,
  options: { guestShifts?: GuestShiftInput[] } = {}
): { plan: SchedulePlanResult; generateResult: import('./types').GenerateScheduleResult } {
  const fairnessRows = buildEmployeeFairness(grid.rows, context);
  const input = buildGenerateScheduleInput(grid, {
    guestShifts: options.guestShifts,
    fairnessRows,
    ramadanRange: getRamadanRange(),
  });
  const result = generateSchedule(input);
  const actions = generateResultToPlanActions(result, grid.rows);
  const countsAfter = simulateCountsAfterActions(grid, actions);

  const dayIndexByDate = new Map(grid.days.map((d, i) => [d.date, i]));
  const unresolved = slotViolationsToIssues(result.slotViolations, dayIndexByDate);

  const manualGuestNote =
    (options.guestShifts?.length ?? 0) > 0
      ? ' Includes manually added external coverage.'
      : '';

  const summary =
    result.coverageValid && actions.length === 0
      ? `Schedule meets time-slot coverage for all operating periods.${manualGuestNote}`
      : result.coverageValid
        ? `Generated ${actions.length} shift change(s) with full time-slot coverage.${manualGuestNote}`
        : `Generated ${actions.length} change(s); ${unresolved.length} slot(s) still below minCoverage.${manualGuestNote}`;

  const scenario: SchedulePlanScenario = {
    id: 'dynamic',
    labelKey: 'schedule.assistant.scenarioDynamic',
    actions,
    issuesBefore: unresolved,
    issuesAfter: unresolved,
    unresolved,
    countsBefore: grid.counts,
    countsAfter,
    fairness: fairnessRows,
    summary,
  };

  return {
    plan: {
      weekStart: grid.weekStart,
      scenarios: [scenario],
      recommendedScenarioId: 'dynamic',
    },
    generateResult: result,
  };
}
