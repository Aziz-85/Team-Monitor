/**
 * Workforce Strategy AI tests
 */

import { operatingPeriodsForDay } from '@/lib/schedule/generateSchedule/operatingPeriods';
import {
  buildWeeklyStrategy,
  recommendationCategoryOrder,
} from '@/lib/schedule/workforceStrategyAI';
import {
  DEFAULT_GENERATE_SETTINGS,
  type GenerateScheduleInput,
} from '@/lib/schedule/generateSchedule/types';

function makeWeekInput(
  employeeCount: number,
  options: {
    weekStart?: string;
    weeklyOffByEmp?: Record<string, number | 'NONE'>;
    unavailability?: GenerateScheduleInput['unavailability'];
    externalCount?: number;
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

  const regularEmployees = Array.from({ length: employeeCount }, (_, i) => {
    const empId = `emp-${i + 1}`;
    const off = options.weeklyOffByEmp?.[empId];
    return {
      empId,
      name: ['Abdulhadi', 'Hussain', 'Alanoud', 'Abdulaziz', 'Employee 5'][i] ?? `Employee ${i + 1}`,
      isExternalSupport: false,
      weeklyOffDay: off === undefined ? (((i % 7) as number) === 6 ? 0 : (i % 7)) : off,
    };
  });

  const externalSupportEmployees = Array.from({ length: options.externalCount ?? 0 }, (_, i) => ({
    empId: `guest-${i + 1}`,
    name: `Guest ${i + 1}`,
    isExternalSupport: true,
    weeklyOffDay: 'NONE' as const,
  }));

  return {
    weekStart,
    days,
    regularEmployees,
    externalSupportEmployees,
    unavailability: options.unavailability ?? [],
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

function allWeekLeave(empId: string, weekStart: string): GenerateScheduleInput['unavailability'] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return { empId, date: date.toISOString().slice(0, 10), kind: 'leave' as const };
  });
}

describe('buildWeeklyStrategy', () => {
  it('scenario 1: four employees, no leave — no strategy interventions needed', () => {
    const input = makeWeekInput(4, {
      weeklyOffByEmp: {
        'emp-1': 'NONE',
        'emp-2': 'NONE',
        'emp-3': 'NONE',
        'emp-4': 'NONE',
      },
    });
    const strategy = buildWeeklyStrategy(input);
    expect(strategy.strategy.needBridge).toBe(false);
    expect(strategy.strategy.needWeeklyOffMove).toBe(false);
    expect(strategy.strategy.needOvertime).toBe(false);
    expect(strategy.strategy.needExternalSupport).toBe(false);
    expect(strategy.decisions[0]?.answer).toBe('yes');
  });

  it('scenario 2: one on leave — weekly off move fixes week without bridge or overtime', () => {
    const weekStart = '2026-06-15';
    const input = makeWeekInput(5, {
      weekStart,
      weeklyOffByEmp: {
        'emp-1': 'NONE',
        'emp-2': 2,
        'emp-3': 'NONE',
        'emp-4': 'NONE',
        'emp-5': 'NONE',
      },
      unavailability: allWeekLeave('emp-1', weekStart),
    });
    const strategy = buildWeeklyStrategy(input);
    expect(strategy.strategy.needWeeklyOffMove).toBe(true);
    expect(strategy.strategy.needBridge).toBe(false);
    expect(strategy.strategy.needOvertime).toBe(false);
    expect(strategy.strategy.needExternalSupport).toBe(false);
    expect(strategy.recommendations[0]?.category).toBe('WEEKLY_OFF');
  });

  it('scenario 3: weekly off not enough — bridge required', () => {
    const weekStart = '2026-06-15';
    const input = makeWeekInput(4, {
      weekStart,
      weeklyOffByEmp: {
        'emp-1': 'NONE',
        'emp-2': 1,
        'emp-3': 2,
        'emp-4': 3,
      },
      unavailability: allWeekLeave('emp-1', weekStart),
    });
    const strategy = buildWeeklyStrategy(input);
    expect(strategy.strategy.needBridge).toBe(true);
    expect(strategy.strategy.bridgeDays.length).toBeGreaterThan(0);
  });

  it('scenario 4: bridge not enough alone — overtime in hybrid path', () => {
    const weekStart = '2026-06-15';
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(`${weekStart}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + i);
      const iso = date.toISOString().slice(0, 10);
      const dayOfWeek = date.getUTCDay();
      return {
        date: iso,
        dayOfWeek,
        operatingPeriods: operatingPeriodsForDay(dayOfWeek, false).map((p) => ({
          ...p,
          minCoverage: 3,
        })),
        isRamadan: false,
      };
    });
    const input: GenerateScheduleInput = {
      ...makeWeekInput(4, {
        weekStart,
        weeklyOffByEmp: {
          'emp-1': 'NONE',
          'emp-2': 'NONE',
          'emp-3': 'NONE',
          'emp-4': 'NONE',
        },
        unavailability: allWeekLeave('emp-1', weekStart),
      }),
      days,
    };
    const strategy = buildWeeklyStrategy(input);
    expect(
      strategy.strategy.needOvertime || strategy.strategy.needBridge
    ).toBe(true);
  });

  it('scenario 5: still impossible — external support recommended last', () => {
    const weekStart = '2026-06-15';
    const input = makeWeekInput(2, {
      weekStart,
      weeklyOffByEmp: {
        'emp-1': 'NONE',
        'emp-2': 'NONE',
      },
    });
    const strategy = buildWeeklyStrategy(input);
    expect(strategy.strategy.needExternalSupport).toBe(true);
    const externalRec = strategy.recommendations.find((r) => r.category === 'EXTERNAL_SUPPORT');
    expect(externalRec).toBeDefined();
    const lastCategory = strategy.recommendations[strategy.recommendations.length - 1]?.category;
    expect(lastCategory).toBe('EXTERNAL_SUPPORT');
  });

  it('scenario 6: recommendation order is weekly off, bridge, overtime, external', () => {
    const order = recommendationCategoryOrder();
    expect(order).toEqual(['WEEKLY_OFF', 'BRIDGE', 'OVERTIME', 'EXTERNAL_SUPPORT']);

    const weekStart = '2026-06-15';
    const input = makeWeekInput(4, {
      weekStart,
      weeklyOffByEmp: {
        'emp-1': 'NONE',
        'emp-2': 1,
        'emp-3': 2,
        'emp-4': 3,
      },
      unavailability: allWeekLeave('emp-1', weekStart),
    });
    const strategy = buildWeeklyStrategy(input);
    const categories = strategy.recommendations.map((r) => r.category).filter((c) => c !== 'NONE');
    for (let i = 1; i < categories.length; i++) {
      const rank = (c: string) => order.indexOf(c);
      expect(rank(categories[i]!)).toBeGreaterThanOrEqual(rank(categories[i - 1]!));
    }
  });

  it('exposes planner intent and execution hints for proposal generator', () => {
    const input = makeWeekInput(4, {
      weeklyOffByEmp: {
        'emp-1': 'NONE',
        'emp-2': 'NONE',
        'emp-3': 'NONE',
        'emp-4': 'NONE',
      },
    });
    const strategy = buildWeeklyStrategy(input);
    expect(strategy.plannerIntent.text.length).toBeGreaterThan(10);
    expect(strategy.execution).toMatchObject({
      allowWeeklyOffMove: expect.any(Boolean),
      allowBridge: expect.any(Boolean),
      allowOvertime: expect.any(Boolean),
    });
  });
});
