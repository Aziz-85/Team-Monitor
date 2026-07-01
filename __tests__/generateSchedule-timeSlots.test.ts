import {
  buildTimeSlots,
  calculateCoverageForSlot,
  validateCoverage,
  buildDaySlotBundles,
  segmentFromPeriodStart,
} from '@/lib/schedule/generateSchedule/timeSlots';
import { operatingPeriodsForDay, FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { countEmployeeWeeklySplitDays } from '@/lib/schedule/generateSchedule/fairness';
import type { WorkingDayShift } from '@/lib/schedule/generateSchedule/types';

describe('buildTimeSlots', () => {
  it('creates 30-minute slots for a normal weekday period', () => {
    const periods = operatingPeriodsForDay(6, false);
    const slots = buildTimeSlots(periods, '2026-06-20', 30);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].startTime).toBe('09:30');
    expect(slots.every((s) => s.minCoverage === 2)).toBe(true);
  });

  it('creates fewer slots for Friday normal (evening only)', () => {
    const fri = operatingPeriodsForDay(FRIDAY_DOW, false);
    const sat = operatingPeriodsForDay(6, false);
    const friSlots = buildTimeSlots(fri, '2026-06-19', 30);
    const satSlots = buildTimeSlots(sat, '2026-06-20', 30);
    expect(friSlots.length).toBeLessThan(satSlots.length);
    expect(friSlots[0].startTime).toBe('16:00');
  });

  it('handles overnight ramadan period (20:30–02:30)', () => {
    const periods = operatingPeriodsForDay(6, true);
    const slots = buildTimeSlots(periods, '2026-02-10', 30);
    const overnight = slots.filter((s) => s.periodIndex === 1);
    expect(overnight.length).toBeGreaterThan(0);
    expect(overnight.some((s) => s.startTime === '20:30')).toBe(true);
  });
});

describe('calculateCoverageForSlot', () => {
  it('counts unique employees covering a slot', () => {
    const periods = operatingPeriodsForDay(6, false);
    const slots = buildTimeSlots(periods, '2026-06-20', 30);
    const slot = slots[0];
    const seg = segmentFromPeriodStart(periods[0], 0, 8);
    const shifts: WorkingDayShift[] = [
      { empId: 'e1', name: 'A', date: '2026-06-20', isExternalSupport: false, segments: [seg], reasons: [] },
      { empId: 'e2', name: 'B', date: '2026-06-20', isExternalSupport: false, segments: [seg], reasons: [] },
    ];
    expect(calculateCoverageForSlot(shifts, slot)).toBe(2);
  });
});

describe('validateCoverage', () => {
  it('reports violations when coverage is below minCoverage', () => {
    const days = [
      {
        date: '2026-06-20',
        dayOfWeek: 6,
        isRamadan: false,
        operatingPeriods: operatingPeriodsForDay(6, false),
      },
    ];
    const bundles = buildDaySlotBundles(days, 30);
    const byDate = new Map<string, WorkingDayShift[]>([['2026-06-20', []]]);
    const { valid, violations } = validateCoverage(bundles, byDate);
    expect(valid).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].minCoverage).toBe(2);
  });
});

describe('countEmployeeWeeklySplitDays', () => {
  it('counts distinct split days per employee', () => {
    const count = countEmployeeWeeklySplitDays('e1', [
      { empId: 'e1', date: '2026-06-20', splitDay: true },
      { empId: 'e1', date: '2026-06-21', splitDay: true },
      { empId: 'e1', date: '2026-06-22', splitDay: false },
    ]);
    expect(count).toBe(2);
  });
});
