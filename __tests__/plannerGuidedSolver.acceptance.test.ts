/**
 * Acceptance test — Planner-Guided Solver
 *
 * 4 employees, 1 on leave all week, normal week:
 *   Sat–Thu: AM >= 2, PM >= 2
 *   Friday: PM >= 2
 *   Bridge distributed fairly
 *   No timeout
 */

import { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
import { operatingPeriodsForDay, FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { countAmPmForDay } from '@/lib/schedule/plannerGuidedSolver';
import { MAX_SOLVE_MS } from '@/lib/schedule/generateSchedule/solverLimits';
import {
  DEFAULT_GENERATE_SETTINGS,
  type GenerateScheduleInput,
  type EmployeeDayAssignment,
} from '@/lib/schedule/generateSchedule/types';

function makeAcceptanceInput(): GenerateScheduleInput {
  const weekStart = '2026-06-15';
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

  const regularEmployees = Array.from({ length: 4 }, (_, i) => ({
    empId: `emp-${i + 1}`,
    name: ['Abdulhadi', 'Hussain', 'Abdulaziz', 'Employee 4'][i],
    isExternalSupport: false,
    weeklyOffDay: 'NONE' as const,
  }));

  const unavailability = days.map((d) => ({
    empId: 'emp-1',
    date: d.date,
    kind: 'leave' as const,
  }));

  return {
    weekStart,
    days,
    regularEmployees,
    externalSupportEmployees: [],
    unavailability,
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

function assignmentsForDate(assignments: EmployeeDayAssignment[], date: string) {
  return assignments.filter((a) => a.date === date && a.shiftKind !== 'Off' && a.shiftKind !== 'Leave');
}

describe('Planner-Guided Solver acceptance', () => {
  it('4 employees with 1 on leave all week — Sat–Thu AM≥2 PM≥2, Friday PM≥2, fair bridges, no timeout', () => {
    const input = makeAcceptanceInput();
    const started = performance.now();
    const result = generateSchedule(input);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(MAX_SOLVE_MS + 500);
    expect(result.coverageValid).toBe(true);
    expect(result.solverStatus).toBe('COMPLETE');

    input.days.forEach((day) => {
      const working = result.assignments
        .filter((a) => a.date === day.date && a.segments.length > 0)
        .map((a) => ({
          empId: a.empId,
          name: a.name,
          date: a.date,
          isExternalSupport: a.isExternalSupport,
          segments: a.segments,
          reasons: a.reasons,
        }));

      const { am, pm } = countAmPmForDay(
        working,
        day.operatingPeriods,
        day.dayOfWeek,
        day.isRamadan
      );

      if (day.dayOfWeek === FRIDAY_DOW) {
        expect(am).toBe(0);
        expect(pm).toBeGreaterThanOrEqual(2);
      } else {
        expect(am).toBeGreaterThanOrEqual(2);
        expect(pm).toBeGreaterThanOrEqual(2);
      }
    });

    const bridgeCounts = result.employeeSummaries.map((s) => s.bridgeDays);
    const totalBridges = bridgeCounts.reduce((sum, n) => sum + n, 0);
    expect(totalBridges).toBeGreaterThan(0);

    const workingBridge = result.employeeSummaries.filter((s) => s.empId !== 'emp-1');
    const maxBridge = Math.max(...workingBridge.map((s) => s.bridgeDays));
    const minBridge = Math.min(...workingBridge.map((s) => s.bridgeDays));
    expect(maxBridge - minBridge).toBeLessThanOrEqual(1);

    const onLeave = result.assignments.filter((a) => a.empId === 'emp-1' && a.shiftKind === 'Leave');
    expect(onLeave.length).toBe(7);

    result.assignments
      .filter((a) => a.shiftKind === 'Bridge')
      .forEach((a) => {
        expect(a.totalHours).toBe(10);
      });

    const owed = result.employeeSummaries.reduce((s, e) => s + e.compensationOwedHours, 0);
    expect(owed).toBe(totalBridges * 2);
  });
});
