/**
 * Bridge dynamic generate engine to SchedulePlanResult for the schedule assistant UI.
 */

import type { ScheduleGridResult } from '@/lib/services/scheduleGrid';
import type { GuestShiftInput } from '@/lib/services/schedulePlanGuests';
import type { FairnessContext } from '@/lib/services/schedulePlannerFairness';
import { buildEmployeeFairness } from '@/lib/services/schedulePlannerFairness';
import type { SchedulePlanResult, SchedulePlanScenario, DayIssue } from '@/lib/services/schedulePlanner';
import { getRamadanRange } from '@/lib/time/ramadan';
import { buildGenerateScheduleInput } from './buildInput';
import { generateSchedule } from './engine';
import { generateResultToPlanActions } from './toPlanActions';

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
    countsAfter: grid.counts,
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
