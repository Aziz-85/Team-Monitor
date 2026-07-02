/**
 * Schedule plan contract types + AI context serializer.
 *
 * Engine v3: the legacy scenario planner (buildSchedulePlan and its AM/PM simulation)
 * was removed. Plans are produced ONLY by the Schedule Engine
 * (lib/schedule/generateSchedule → planBridge.buildSchedulePlanFromGenerate).
 * This module keeps the shared types consumed by the UI, apply route, and bridge.
 */

import type { DayCounts } from './scheduleGrid';
import type { CoverageViolation } from '@/lib/schedule/coveragePolicy';
import { MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK } from '@/lib/schedule/coveragePolicy';
import type { EmployeeFairnessRow } from './schedulePlannerFairness';
import type { GuestShiftInput } from './schedulePlanGuests';

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
  sourceBoutiqueId?: string;
  /** Segment detail from the engine — persisted to ShiftOverrideSegment on apply. */
  segments?: Array<{ startTime: string; endTime: string; periodIndex: number }>;
};

export type SchedulePlanOptions = {
  /** Manually added external coverage already on the week (counts only; never auto-added). */
  guestShifts?: GuestShiftInput[];
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

export function planToAiContext(plan: SchedulePlanResult, scenarioId?: string): string {
  const scenario = plan.scenarios.find((s) => s.id === (scenarioId ?? plan.recommendedScenarioId)) ?? plan.scenarios[0];
  if (!scenario) return 'No plan available.';
  const lines = [
    `Week: ${plan.weekStart}`,
    `Policy: coverage validated per 30-minute time slot from operating periods; Split max ${MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK}/employee/week.`,
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
