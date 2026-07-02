/**
 * Constraint Analyzer — pre-solve feasibility for Schedule Engine v3.
 */

import { operatingPeriodsForDay } from '@/lib/schedule/generateSchedule/operatingPeriods';
import {
  DEFAULT_GENERATE_SETTINGS,
  type GenerateScheduleInput,
} from '@/lib/schedule/generateSchedule/types';
import {
  analyzeScheduleConstraints,
  mainConstraintReason,
  topConstraintRecommendation,
} from '@/lib/schedule/constraintAnalyzer';

function makeWeekInput(
  employeeCount: number,
  options: {
    weekStart?: string;
    weeklyOffDay?: number | 'NONE';
    unavailability?: GenerateScheduleInput['unavailability'];
    externalSupportEmployees?: GenerateScheduleInput['externalSupportEmployees'];
    settings?: GenerateScheduleInput['settings'];
  } = {}
): GenerateScheduleInput {
  const weekStart = options.weekStart ?? '2026-06-15';
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

  const weeklyOffDay = options.weeklyOffDay ?? 'NONE';
  const regularEmployees = Array.from({ length: employeeCount }, (_, i) => ({
    empId: `emp-${i + 1}`,
    name: `Employee ${i + 1}`,
    isExternalSupport: false,
    weeklyOffDay: weeklyOffDay === 'NONE' ? ('NONE' as const) : ((weeklyOffDay + i) % 7),
  }));

  return {
    weekStart,
    days,
    regularEmployees,
    externalSupportEmployees: options.externalSupportEmployees ?? [],
    unavailability: options.unavailability ?? [],
    settings: options.settings ?? DEFAULT_GENERATE_SETTINGS,
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

describe('analyzeScheduleConstraints', () => {
  it('4 employees with no weekly off = FEASIBLE', () => {
    const input = makeWeekInput(4, { weeklyOffDay: 'NONE' });
    const result = analyzeScheduleConstraints(input);

    expect(result.status).toBe('FEASIBLE');
    expect(result.feasible).toBe(true);
    expect(result.summary.missingStaffHours).toBe(0);
    expect(result.issues.filter((i) => i.severity === 'critical')).toHaveLength(0);
  });

  it('1 employee = IMPOSSIBLE (peak minCoverage 2)', () => {
    const input = makeWeekInput(1, { weeklyOffDay: 'NONE' });
    const result = analyzeScheduleConstraints(input);

    expect(result.status).toBe('IMPOSSIBLE');
    expect(result.feasible).toBe(false);
    expect(result.issues.some((i) => i.type === 'PEAK_COVERAGE_SHORTAGE')).toBe(true);
    expect(mainConstraintReason(result)).toMatch(/peak minCoverage/i);
  });

  it('all employees on leave all week = IMPOSSIBLE', () => {
    const input = makeWeekInput(4, { weeklyOffDay: 'NONE' });
    input.unavailability = input.days.flatMap((day) =>
      input.regularEmployees.map((emp) => ({
        empId: emp.empId,
        date: day.date,
        kind: 'leave' as const,
      }))
    );

    const result = analyzeScheduleConstraints(input);

    expect(result.status).toBe('IMPOSSIBLE');
    expect(result.feasible).toBe(false);
    expect(result.issues.some((i) => i.type === 'LEAVE_OVERLOAD')).toBe(true);
    expect(result.recommendations.some((r) => r.type === 'ADJUST_LEAVE')).toBe(true);
  });

  it('shows add external support recommendation when missing hours > 0', () => {
    const input = makeWeekInput(3, { weeklyOffDay: 'NONE' });
    const result = analyzeScheduleConstraints(input);

    expect(result.summary.missingStaffHours).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.type === 'ADD_EXTERNAL_SUPPORT')).toBe(true);
    expect(topConstraintRecommendation(result)).toMatch(/external support/i);
  });

  it('includes insights with ranked recommendations', () => {
    const input = makeWeekInput(1, { weeklyOffDay: 'NONE' });
    const result = analyzeScheduleConstraints(input);

    expect(result.insights).toBeDefined();
    expect(result.insights.whyImpossible).toBeTruthy();
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].rank).toBe(1);
    expect(result.recommendations[0].estimatedEffect).toBeTruthy();
  });
});
