/**
 * Month helpers for Executive Monthly and URL-driven month selection.
 * parseMonthKey, addMonths, getCurrentMonthKeyRiyadh (lib/time.ts).
 */

import {
  parseMonthKey,
  addMonths,
  getCurrentMonthKeyRiyadh,
  normalizeMonthKey,
  getMonthRange,
} from '@/lib/time';

describe('parseMonthKey', () => {
  it('returns { y, m } for valid YYYY-MM', () => {
    expect(parseMonthKey('2026-01')).toEqual({ y: 2026, m: 1 });
    expect(parseMonthKey('2026-12')).toEqual({ y: 2026, m: 12 });
    expect(parseMonthKey('2025-06')).toEqual({ y: 2025, m: 6 });
  });

  it('returns null for invalid format', () => {
    expect(parseMonthKey('')).toBeNull();
    expect(parseMonthKey('2026/01')).toBeNull();
    expect(parseMonthKey('01-2026')).toBeNull();
    expect(parseMonthKey('2026-00')).toBeNull();
    expect(parseMonthKey('2026-13')).toBeNull();
    expect(parseMonthKey('abc')).toBeNull();
  });

  it('trims input', () => {
    expect(parseMonthKey('  2026-02  ')).toEqual({ y: 2026, m: 2 });
  });
});

describe('addMonths', () => {
  it('adds months within same year', () => {
    expect(addMonths('2026-01', 1)).toBe('2026-02');
    expect(addMonths('2026-06', 3)).toBe('2026-09');
  });

  it('crosses year boundary forward', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
  });

  it('crosses year boundary backward', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-02', -2)).toBe('2025-12');
  });

  it('returns input unchanged when parseMonthKey returns null', () => {
    expect(addMonths('invalid', 1)).toBe('invalid');
  });
});

describe('getCurrentMonthKeyRiyadh', () => {
  it('returns YYYY-MM format', () => {
    const key = getCurrentMonthKeyRiyadh();
    expect(key).toMatch(/^\d{4}-\d{2}$/);
    expect(parseMonthKey(key)).not.toBeNull();
  });
});

describe('normalizeMonthKey', () => {
  it('normalizes Arabic digits to ASCII', () => {
    expect(normalizeMonthKey('2026-٠٢')).toBe('2026-02');
  });
});

describe('getMonthRange', () => {
  it('returns start and endExclusive for month', () => {
    const { start, endExclusive } = getMonthRange('2026-02');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});
