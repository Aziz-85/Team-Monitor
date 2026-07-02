/**
 * Schedule Engine v3 solver — caps, early exit, and performance bounds.
 */

import { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
import { operatingPeriodsForDay } from '@/lib/schedule/generateSchedule/operatingPeriods';
import {
  DEFAULT_GENERATE_SETTINGS,
  type GenerateScheduleInput,
} from '@/lib/schedule/generateSchedule/types';
import {
  MAX_SCENARIOS,
  MAX_TOTAL_ITERATIONS,
  MAX_SOLVE_MS,
} from '@/lib/schedule/generateSchedule/solverLimits';

function makeWeekInput(employeeCount: number, weekStart = '2026-06-15'): GenerateScheduleInput {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getUTCDay();
    return {
      date: iso,
      dayOfWeek,
      operatingPeriods: operatingPeriodsForDay(dayOfWeek, false),
      isRamadan: false,
    };
  });

  const regularEmployees = Array.from({ length: employeeCount }, (_, i) => ({
    empId: `emp-${i + 1}`,
    name: `Employee ${i + 1}`,
    isExternalSupport: false,
    weeklyOffDay: (i % 7) as number,
  }));

  return {
    weekStart,
    days,
    regularEmployees,
    externalSupportEmployees: [],
    unavailability: [],
    settings: DEFAULT_GENERATE_SETTINGS,
    historicalStats: regularEmployees.map((e) => ({
      empId: e.empId,
      priorWeekHours: 40,
      priorWeekPmHours: 16,
      priorWeekFridayHours: 0,
      priorWeekSplitDays: 0,
    })),
    preserveExisting: false,
  };
}

describe('generateSchedule solver limits', () => {
  it('completes 4 employees × 7 days within time and iteration caps', () => {
    const input = makeWeekInput(4);
    const started = performance.now();
    const result = generateSchedule(input);
    const elapsed = performance.now() - started;

    const totalDayIterations = Object.values(result.iterationsByDay).reduce((s, n) => s + n, 0);

    expect(elapsed).toBeLessThan(3000);
    expect(totalDayIterations).toBeLessThanOrEqual(MAX_TOTAL_ITERATIONS);
    expect(result.scenariosTried).toBeLessThanOrEqual(MAX_SCENARIOS);
    expect(result.iterationsByScenario.length).toBe(result.scenariosTried);
    expect(result.solverStatus).toBeDefined();
    expect(['COMPLETE', 'PARTIAL_TIMEOUT', 'PARTIAL_ITERATION_LIMIT', 'IMPOSSIBLE']).toContain(
      result.solverStatus
    );
  });

  it('returns IMPOSSIBLE quickly when staffing cannot meet peak coverage', () => {
    const input = makeWeekInput(1);
    const started = performance.now();
    const result = generateSchedule(input);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(MAX_SOLVE_MS + 500);
    expect(result.solverStatus).toBe('IMPOSSIBLE');
    expect(result.stoppedReason).toBe('IMPOSSIBLE_STAFFING');
    expect(result.slotViolations.length).toBeGreaterThan(0);
    expect(result.coverageValid).toBe(false);
  });

  it('generates at most one rotation variant per employee plus base', () => {
    const input = makeWeekInput(4);
    const result = generateSchedule(input);
    expect(result.scenariosTried).toBeLessThanOrEqual(1 + input.regularEmployees.length);
    expect(result.scenariosTried).toBeLessThanOrEqual(MAX_SCENARIOS);
  });
});
