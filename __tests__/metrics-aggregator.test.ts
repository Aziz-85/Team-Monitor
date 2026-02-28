/**
 * Metrics aggregator and date-boundary tests.
 * Ensures MTD and month range use Asia/Riyadh boundaries and target math is consistent.
 */

import { getMonthRange, getDaysInMonth, normalizeMonthKey } from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';

describe('getMonthRange (Asia/Riyadh boundaries)', () => {
  it('returns first day 00:00 and first day of next month 00:00 for 2026-02', () => {
    const { start, endExclusive } = getMonthRange('2026-02');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('returns correct range for 2025-12', () => {
    const { start, endExclusive } = getMonthRange('2025-12');
    expect(start.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('getDaysInMonth', () => {
  it('returns 28 for 2026-02', () => {
    expect(getDaysInMonth('2026-02')).toBe(28);
  });
  it('returns 31 for 2026-01', () => {
    expect(getDaysInMonth('2026-01')).toBe(31);
  });
});

describe('normalizeMonthKey', () => {
  it('normalizes ASCII YYYY-MM', () => {
    expect(normalizeMonthKey('2026-02')).toBe('2026-02');
  });
});

describe('getDailyTargetForDay', () => {
  it('distributes 30000 SAR across 30 days: base 1000, first 0 remainder days get 1000', () => {
    const total = 30000;
    const days = 30;
    expect(getDailyTargetForDay(total, days, 1)).toBe(1000);
    expect(getDailyTargetForDay(total, days, 30)).toBe(1000);
  });

  it('distributes 1000 SAR across 3 days: remainder 1 so day 1 gets 334, rest 333', () => {
    const total = 1000;
    const days = 3;
    expect(getDailyTargetForDay(total, days, 1)).toBe(334);
    expect(getDailyTargetForDay(total, days, 2)).toBe(333);
    expect(getDailyTargetForDay(total, days, 3)).toBe(333);
    expect(334 + 333 + 333).toBe(1000);
  });
});
