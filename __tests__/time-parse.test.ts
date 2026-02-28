/**
 * Canonical ISO date/month parsing. Use for API and range logic; avoids locale (e.g. Arabic) day/month flip.
 */

import {
  parseIsoDateOrThrow,
  parseMonthKeyOrThrow,
  formatIsoDate,
  InvalidIsoDateError,
  InvalidMonthKeyError,
} from '@/lib/time/parse';

describe('parseIsoDateOrThrow', () => {
  it('parses valid YYYY-MM-DD and returns Date at UTC midnight', () => {
    const d = parseIsoDateOrThrow('2026-02-15');
    expect(d.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  it('throws InvalidIsoDateError for non-ISO format', () => {
    expect(() => parseIsoDateOrThrow('28/02/2026')).toThrow(InvalidIsoDateError);
    expect(() => parseIsoDateOrThrow('2026/28/02')).toThrow(InvalidIsoDateError);
    expect(() => parseIsoDateOrThrow('')).toThrow(InvalidIsoDateError);
  });

  it('throws for invalid month or day', () => {
    expect(() => parseIsoDateOrThrow('2026-13-01')).toThrow(InvalidIsoDateError);
    expect(() => parseIsoDateOrThrow('2026-00-01')).toThrow(InvalidIsoDateError);
    expect(() => parseIsoDateOrThrow('2026-02-30')).toThrow(InvalidIsoDateError);
  });

  it('accepts last day of month', () => {
    const d = parseIsoDateOrThrow('2026-02-28');
    expect(d.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('parseMonthKeyOrThrow', () => {
  it('returns normalized YYYY-MM for valid input', () => {
    expect(parseMonthKeyOrThrow('2026-02')).toBe('2026-02');
    expect(parseMonthKeyOrThrow('2026-01')).toBe('2026-01');
  });

  it('throws InvalidMonthKeyError for non-YYYY-MM', () => {
    expect(() => parseMonthKeyOrThrow('02-2026')).toThrow(InvalidMonthKeyError);
    expect(() => parseMonthKeyOrThrow('2026/02')).toThrow(InvalidMonthKeyError);
    expect(() => parseMonthKeyOrThrow('')).toThrow(InvalidMonthKeyError);
  });

  it('throws for month out of range', () => {
    expect(() => parseMonthKeyOrThrow('2026-00')).toThrow(InvalidMonthKeyError);
    expect(() => parseMonthKeyOrThrow('2026-13')).toThrow(InvalidMonthKeyError);
  });
});

describe('formatIsoDate', () => {
  it('formats Date as YYYY-MM-DD in Riyadh', () => {
    const d = new Date(Date.UTC(2026, 1, 15, 0, 0, 0, 0));
    expect(formatIsoDate(d)).toBe('2026-02-15');
  });
});
