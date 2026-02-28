/**
 * Riyadh timezone (Asia/Riyadh) and date/month/week utilities.
 * Week starts Saturday. All dates normalized to 00:00 in Riyadh where applicable.
 */

const RIYADH_TZ = 'Asia/Riyadh';

/** Current date/time in Riyadh as Date. Uses Intl for reliable parsing across Node envs. */
export function getRiyadhNow(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '0';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const hr = Number(get('hour'));
  const min = Number(get('minute'));
  const sec = Number(get('second'));
  if (!Number.isFinite(y + m + d)) return now;
  return new Date(Date.UTC(y, m - 1, d, hr, min, sec, 0));
}

/**
 * Format date as YYYY-MM-DD in Riyadh. Use for SalesEntry.dateKey and day-key logic.
 */
export function toRiyadhDateString(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    const n = new Date();
    return n.toISOString().slice(0, 10);
  }
  return date.toLocaleDateString('en-CA', { timeZone: RIYADH_TZ }).replace(/\//g, '-');
}

/**
 * Normalize a date to date-only at 00:00 in Riyadh.
 * Returns a Date at UTC midnight representing that calendar day (for DB DATE comparison).
 */
export function toRiyadhDateOnly(date: Date): Date {
  if (Number.isNaN(date.getTime())) {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0, 0, 0, 0));
  }
  const str = toRiyadhDateString(date);
  const [y, m, d] = str.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0, 0, 0, 0));
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/** Start of calendar day in Riyadh as UTC midnight (for day-range queries). */
export function startOfDayRiyadh(date: Date): Date {
  return toRiyadhDateOnly(date);
}

/** Add n calendar days to a date (UTC). Preserves 00:00 time. */
export function addDays(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * Normalize to a single date-only value for ledger and SalesEntry (Asia/Riyadh).
 * Accepts "YYYY-MM-DD" or Date; returns a Date at UTC midnight for that calendar day.
 * Use this for all DB date comparisons and keys so ledger and SalesEntry never drift.
 */
export function normalizeDateOnlyRiyadh(input: string | Date): Date {
  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (match) {
      const [, y, m, d] = match;
      const yi = Number(y);
      const mi = Number(m);
      const di = Number(d);
      if (Number.isFinite(yi) && Number.isFinite(mi) && Number.isFinite(di)) {
        return new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0, 0));
      }
    }
    return toRiyadhDateOnly(new Date(input + 'T12:00:00.000Z'));
  }
  return toRiyadhDateOnly(input);
}

/** Alias for toRiyadhDateString: format date as YYYY-MM-DD in Riyadh (for dateKey). */
export function formatDateRiyadh(date: Date): string {
  return toRiyadhDateString(date);
}

/**
 * Format date for display as DD/MM/YYYY in Asia/Riyadh.
 * Use for UI (leaves, tasks, etc.) so all date display is timezone-consistent.
 */
export function formatDateDisplayRiyadh(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input.includes('T') ? input : input + 'T12:00:00.000Z') : input;
  if (Number.isNaN(date.getTime())) return '—';
  const str = toRiyadhDateString(date);
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Format date and time for display in Asia/Riyadh (e.g. "14/02/2026, 15:45").
 * Use for timestamps in UI (task completions, etc.).
 */
export function formatDateTimeDisplayRiyadh(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  const dateStr = toRiyadhDateString(date);
  const [y, m, d] = dateStr.split('-');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: RIYADH_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${d}/${m}/${y}, ${hour}:${minute}`;
}

/**
 * Month key "YYYY-MM" for a date in Riyadh.
 */
export function formatMonthKey(date: Date): string {
  return toRiyadhDateString(date).slice(0, 7);
}

/** Normalize YYYY-MM string to ASCII digits (e.g. "2026-0١" → "2026-01") so Date parsing and DB queries work. */
export function normalizeMonthKey(monthKey: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return monthKey.replace(/[٠-٩]/g, (c) => String(arabicDigits.indexOf(c)));
}

/**
 * Start (inclusive) and end (exclusive) of month in Riyadh.
 * start: first day 00:00, endExclusive: first day of next month 00:00 (for range queries).
 */
export function getMonthRange(monthKey: string): { start: Date; endExclusive: Date } {
  const normalized = normalizeMonthKey(monthKey);
  const [y, m] = normalized.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

/**
 * Week range in Riyadh with week starting Saturday.
 * Returns startSat and endExclusive (next Saturday 00:00 UTC) for the week containing the given date.
 * Uses UTC midnight dates for DB DATE comparison.
 */
export function getWeekRangeForDate(date: Date): { startSat: Date; endExclusiveFriPlus1: Date } {
  const str = toRiyadhDateString(date);
  const [y, m, d] = str.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const dow = utc.getUTCDay(); // 0=Sun .. 6=Sat
  const daysToSaturday = (dow - 6 + 7) % 7;
  const startSat = new Date(utc);
  startSat.setUTCDate(startSat.getUTCDate() - daysToSaturday);
  const endExclusive = new Date(startSat);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 7);
  return { startSat, endExclusiveFriPlus1: endExclusive };
}

/**
 * Intersect two ranges [aStart, aEnd) and [bStart, bEnd).
 * Returns { start, end } for the overlap, or null if no overlap.
 */
export function intersectRanges(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): { start: Date; end: Date } | null {
  const start = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const end = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  if (start.getTime() >= end.getTime()) return null;
  return { start, end };
}

/**
 * Number of calendar days in a month (for daily target = monthlyTarget / daysInMonth).
 */
export function getDaysInMonth(monthKey: string): number {
  const normalized = normalizeMonthKey(monthKey);
  const [y, m] = normalized.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.getUTCDate();
}

/**
 * Days from the given date to end of month, INCLUDING that day.
 * monthKey "YYYY-MM", dateStr "YYYY-MM-DD"; month/day boundaries follow calendar (Asia/Riyadh canonical).
 * Used for dynamic daily target: dailyRequiredSar = ceil(remainingSar / daysRemainingIncludingToday).
 */
export function getDaysRemainingInMonthIncluding(monthKey: string, dateStr: string): number {
  const normalized = normalizeMonthKey(monthKey);
  const lastDay = getDaysInMonth(normalized);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return 0;
  const day = Number(match[3]);
  if (!Number.isFinite(day) || day < 1 || day > lastDay) return 0;
  return lastDay - day + 1;
}
