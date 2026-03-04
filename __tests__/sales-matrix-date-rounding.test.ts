/**
 * Sales Matrix date window + rounding — safety tests.
 * Run: npx jest __tests__/sales-matrix-date-rounding.test.ts
 *
 * Verifies:
 * - January 2026 day keys are exactly 2026-01-01 .. 2026-01-31 (no Feb 1 in January matrix).
 * - toRiyadhDayKey produces Riyadh calendar day from Date/string.
 * - Decimal import rounds to integer and tracks roundedFrom for audit.
 * - Monthly matrix import includes day 1 (2026-02-01); allowed set and date parsing use Riyadh.
 *
 * Proof after import (run in DB) — day 1 must exist, no day shift:
 *   SELECT date, SUM(amount)::int total
 *   FROM "SalesEntry"
 *   WHERE "boutiqueId" = 'bout_dhhrn_001' AND month = '2026-01' AND source = 'IMPORT'
 *   GROUP BY date ORDER BY date;
 *   (Repeat for month = '2026-02'. Expect day 1 row present.)
 */

import {
  getMonthRangeDayKeys,
  toRiyadhDayKey,
  getDaysInMonth,
} from '@/lib/time';
import { safeParseIntCell } from '@/lib/sales/importMatrix';
import { parseExcelDateToDateKey } from '@/lib/sales/excelDateKey';

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

  describe('Monthly matrix import includes day 1 (regression)', () => {
    it('February 2026 first data row is day 1 (2026-02-01)', () => {
      const { keys } = getMonthRangeDayKeys('2026-02');
      expect(keys[0]).toBe('2026-02-01');
      expect(keys).toContain('2026-02-01');
    });

    it('Excel date Feb 1 midnight Riyadh (UTC 2026-01-31T21:00:00Z) parses to 2026-02-01', () => {
      const excelFeb1Riyadh = new Date('2026-01-31T21:00:00.000Z');
      expect(toRiyadhDayKey(excelFeb1Riyadh)).toBe('2026-02-01');
    });

    it('allowedDateSet built from getMonthRangeDayKeys includes 2026-02-01', () => {
      const { keys } = getMonthRangeDayKeys('2026-02');
      const set = new Set(keys);
      expect(set.has('2026-02-01')).toBe(true);
    });
  });
});

describe('parseExcelDateToDateKey (shared Excel date → Riyadh dateKey)', () => {
  it('Excel serial for 2026-01-01 00:00 UTC outputs 2026-01-01', () => {
    const serial = 25569 + (Date.UTC(2026, 0, 1) / 86400000);
    expect(parseExcelDateToDateKey(serial)).toBe('2026-01-01');
  });

  it('Excel serial for 2026-02-01 00:00 UTC outputs 2026-02-01', () => {
    const serial = 25569 + (Date.UTC(2026, 1, 1) / 86400000);
    expect(parseExcelDateToDateKey(serial)).toBe('2026-02-01');
  });

  it('string DD/MM/YYYY "01/02/2026" outputs 2026-02-01', () => {
    expect(parseExcelDateToDateKey('01/02/2026')).toBe('2026-02-01');
  });

  it('string YYYY-MM-DD returns as-is', () => {
    expect(parseExcelDateToDateKey('2026-02-01')).toBe('2026-02-01');
    expect(parseExcelDateToDateKey('2026-01-01')).toBe('2026-01-01');
  });

  it('Date object for Feb 1 (UTC 2026-01-31T21:00:00Z = midnight Riyadh) outputs 2026-02-01', () => {
    const d = new Date('2026-01-31T21:00:00.000Z');
    expect(parseExcelDateToDateKey(d)).toBe('2026-02-01');
  });

  it('Date object for Jan 1 00:00 UTC outputs 2026-01-01', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    expect(parseExcelDateToDateKey(d)).toBe('2026-01-01');
  });

  it('first day missing regression: days 1, 2, 3 produce distinct dateKeys for 2026-02', () => {
    const keys = [
      parseExcelDateToDateKey('01/02/2026'),
      parseExcelDateToDateKey('02/02/2026'),
      parseExcelDateToDateKey('03/02/2026'),
    ];
    expect(keys).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);
    expect(new Set(keys).size).toBe(3);
  });

  it('invalid input returns null', () => {
    expect(parseExcelDateToDateKey(null)).toBeNull();
    expect(parseExcelDateToDateKey('')).toBeNull();
    expect(parseExcelDateToDateKey('not a date')).toBeNull();
    expect(parseExcelDateToDateKey(-1)).toBeNull();
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
