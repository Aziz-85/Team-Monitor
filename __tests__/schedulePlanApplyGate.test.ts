/**
 * Engine v3 Apply gate: plan actions are simulated and validated against
 * 30-minute slot coverage before persistence.
 */

jest.mock('@/lib/db', () => ({ prisma: {} }));

import { validatePlanCoverage } from '@/lib/services/schedulePlannerApply';
import { buildDayCountContexts } from '@/lib/services/scheduleGrid';
import type { ScheduleGridResult } from '@/lib/services/scheduleGrid';
import type { PlanAction } from '@/lib/services/schedulePlanner';

const date = '2026-06-20'; // Saturday, normal mode

function makeGrid(shifts: Array<{ empId: string; shift: string }>): ScheduleGridResult {
  const dayCountContexts = buildDayCountContexts([date]);
  return {
    weekStart: date,
    days: [{ date, dayName: '', dayOfWeek: 6, minAm: 2, minPm: 2 }],
    rows: shifts.map(({ empId, shift }) => ({
      empId,
      name: empId,
      team: 'A',
      effectiveWeeklyOffDay: 'NONE' as const,
      cells: [
        {
          date,
          availability: 'WORK' as const,
          effectiveShift: shift as never,
          overrideId: null,
          baseShift: shift as never,
        },
      ],
    })),
    counts: [{ amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 }],
    dayCountContexts,
    timeCoverage: { valid: true, violations: [] },
    externalCoverageShifts: [],
  };
}

function action(empId: string, toShift: string, segments?: PlanAction['segments']): PlanAction {
  return {
    id: `a-${empId}`,
    type: 'SHIFT_CHANGE',
    date,
    dayIndex: 0,
    empId,
    employeeName: empId,
    fromShift: 'NONE',
    toShift,
    reason: 'test',
    fairnessScore: 0,
    segments,
  };
}

describe('validatePlanCoverage (Apply gate)', () => {
  it('valid when engine segments cover AM and PM operating periods', () => {
    const grid = makeGrid([
      { empId: 'e1', shift: 'NONE' },
      { empId: 'e2', shift: 'NONE' },
      { empId: 'e3', shift: 'NONE' },
      { empId: 'e4', shift: 'NONE' },
    ]);
    const amSeg = [{ periodIndex: 0, startTime: '09:30', endTime: '14:30' }];
    const pmSeg = [{ periodIndex: 1, startTime: '17:30', endTime: '22:30' }];
    const result = validatePlanCoverage(grid, [
      action('e1', 'MORNING', amSeg),
      action('e2', 'MORNING', amSeg),
      action('e3', 'EVENING', pmSeg),
      action('e4', 'EVENING', pmSeg),
    ]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('invalid with slot violations when coverage has a gap', () => {
    const grid = makeGrid([
      { empId: 'e1', shift: 'NONE' },
      { empId: 'e2', shift: 'NONE' },
    ]);
    const morningOnly = [{ periodIndex: 0, startTime: '09:30', endTime: '13:30' }];
    const result = validatePlanCoverage(grid, [
      action('e1', 'MORNING', morningOnly),
      action('e2', 'MORNING', morningOnly),
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].minCoverage).toBe(2);
  });

  it('non-contiguous split segments cover AM and PM periods', () => {
    const grid = makeGrid([
      { empId: 'e1', shift: 'NONE' },
      { empId: 'e2', shift: 'NONE' },
      { empId: 'e3', shift: 'NONE' },
    ]);
    const amSeg = [{ periodIndex: 0, startTime: '09:30', endTime: '14:30' }];
    const pmSeg = [{ periodIndex: 1, startTime: '17:30', endTime: '22:30' }];
    const bridge = [
      { periodIndex: 0, startTime: '09:30', endTime: '14:30' },
      { periodIndex: 1, startTime: '17:30', endTime: '22:30' },
    ];
    const result = validatePlanCoverage(grid, [
      action('e1', 'MORNING', amSeg),
      action('e2', 'SPLIT', bridge),
      action('e3', 'EVENING', pmSeg),
    ]);
    expect(result.valid).toBe(true);
  });
});
