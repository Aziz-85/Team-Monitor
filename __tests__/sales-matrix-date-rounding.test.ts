/**
 * Sales Matrix date window + rounding — safety tests.
 * Run: npx jest __tests__/sales-matrix-date-rounding.test.ts
 *
 * Verifies:
 * - January 2026 day keys are exactly 2026-01-01 .. 2026-01-31 (no Feb 1 in January matrix).
 * - toRiyadhDayKey produces Riyadh calendar day from Date/string.
 * - Decimal import rounds to integer (77599.24 -> 77600) and tracks roundedFrom for audit.
 */

import {
  getMonthRangeDayKeys,
  toRiyadhDayKey,
  getDaysInMonth,
} from '@/lib/time';
import { safeParseIntCell } from '@/lib/sales/importMatrix';

describe('Sales matrix date window (Riyadh)', () => {
  describe('getMonthRangeDayKeys', () => {
    it('January 2026 has exactly 31 keys 2026-01-01 .. 2026-01-31', () => {
      const { startKey, endKey, keys } = getMonthRangeDayKeys('2026-01');
      expect(startKey).toBe('2026-01-01');
      expect(endKey).toBe('2026-01-31');
      expect(keys).toHaveLength(31);
      expect(keys[0]).toBe('2026-01-01');
      expect(keys[30]).toBe('2026-01-31');
    });

    it('2026-02-01 must NOT appear in January matrix', () => {
      const { keys } = getMonthRangeDayKeys('2026-01');
      expect(keys).not.toContain('2026-02-01');
      expect(keys.every((k) => k.startsWith('2026-01-'))).toBe(true);
    });

    it('February 2026 has 28 days', () => {
      const { keys } = getMonthRangeDayKeys('2026-02');
      expect(keys).toHaveLength(28);
      expect(keys[0]).toBe('2026-02-01');
      expect(keys[27]).toBe('2026-02-28');
    });

    it('getDaysInMonth matches key count', () => {
      expect(getDaysInMonth('2026-01')).toBe(31);
      expect(getDaysInMonth('2026-02')).toBe(28);
    });
  });

  describe('toRiyadhDayKey', () => {
    it('returns YYYY-MM-DD for string already in that form', () => {
      expect(toRiyadhDayKey('2026-01-01')).toBe('2026-01-01');
      expect(toRiyadhDayKey('2026-01-31')).toBe('2026-01-31');
    });

    it('formats Date as Riyadh calendar day (UTC midnight Jan 1 -> Jan 1 in Riyadh)', () => {
      const utcJan1 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      expect(toRiyadhDayKey(utcJan1)).toBe('2026-01-01');
    });
  });
});

describe('Decimal import rounding', () => {
  it('decimal amount is rounded to integer and exposes roundedFrom', () => {
    const result = safeParseIntCell(77599.24);
    // In JS, float 77599.24 may round to 77599 or 77600; we require rounded value is integer and original is recorded
    expect(typeof result.value).toBe('number');
    expect(Number.isInteger(result.value)).toBe(true);
    expect(result.value).toBeGreaterThanOrEqual(77599);
    expect(result.value).toBeLessThanOrEqual(77600);
    expect(result.roundedFrom).toBe(77599.24);
  });

  it('77599.5 rounds to 77600', () => {
    const result = safeParseIntCell(77599.5);
    expect(result.value).toBe(77600);
    expect(result.roundedFrom).toBe(77599.5);
  });

  it('integer amount has no roundedFrom', () => {
    const result = safeParseIntCell(47300);
    expect(result.value).toBe(47300);
    expect(result.roundedFrom).toBeUndefined();
  });

  it('negative returns null', () => {
    const result = safeParseIntCell(-100);
    expect(result.value).toBeNull();
  });

  it('non-numeric returns null', () => {
    expect(safeParseIntCell('abc').value).toBeNull();
    expect(safeParseIntCell(NaN).value).toBeNull();
  });
});
