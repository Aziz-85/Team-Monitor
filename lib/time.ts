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
  const d = Number.isNaN(date.getTime()) ? new Date() : date;
  return d.toLocaleDateString('en-CA', { timeZone: RIYADH_TZ }).replace(/\//g, '-');
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

/** Normalize YYYY-MM: Arabic digits → ASCII, and zero-pad month (e.g. "2026-0١" → "2026-01", "2025-1" → "2025-01") so DB queries match. */
export function normalizeMonthKey(monthKey: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const ascii = monthKey.replace(/[٠-٩]/g, (c) => String(arabicDigits.indexOf(c)));
  const parts = ascii.trim().split('-');
  if (parts.length >= 2) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }
  return ascii;
}

/**
 * Parse "YYYY-MM" into { y, m }. Returns null if invalid.
 */
export function parseMonthKey(monthKey: string): { y: number; m: number } | null {
  const normalized = normalizeMonthKey(monthKey.trim());
  const match = /^(\d{4})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

/**
 * Add delta months to "YYYY-MM". Handles year boundaries (e.g. Dec + 1 = next Jan).
 */
export function addMonths(monthKey: string, delta: number): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  let { y, m } = parsed;
  m += delta;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  const mm = String(m).padStart(2, '0');
  return `${y}-${mm}`;
}

/** Current month in Asia/Riyadh as "YYYY-MM". */
export function getCurrentMonthKeyRiyadh(): string {
  return formatMonthKey(getRiyadhNow());
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
 * Riyadh calendar day key from a Date or date string.
 * Use for SalesEntry.dateKey and any day-key logic so all month/day mapping is correct in Asia/Riyadh.
 */
export function toRiyadhDayKey(date: Date | string): string {
  if (typeof date === 'string') {
    const s = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s.includes('T') ? s : s + 'T12:00:00.000Z');
    if (!Number.isNaN(d.getTime())) return toRiyadhDateString(d);
    return toRiyadhDateString(getRiyadhNow());
  }
  if (Number.isNaN(date.getTime())) return toRiyadhDateString(getRiyadhNow());
  return toRiyadhDateString(date);
}

/**
 * Day keys for a calendar month in Riyadh: ["YYYY-MM-01", "YYYY-MM-02", ..., "YYYY-MM-31"] (or 28/29/30).
 * Single source of truth for matrix day columns and month range so Jan 2026 is exactly 2026-01-01 .. 2026-01-31.
 */
export function getMonthRangeDayKeys(monthKey: string): { startKey: string; endKey: string; keys: string[] } {
  const normalized = normalizeMonthKey(monthKey);
  const [y, m] = normalized.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const lastDay = getDaysInMonth(normalized);
  const keys: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    keys.push(`${y}-${mm}-${String(d).padStart(2, '0')}`);
  }
  return {
    startKey: keys[0] ?? '',
    endKey: keys[keys.length - 1] ?? '',
    keys,
  };
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

/**
 * Calendar year / month (1–12) / day in Asia/Riyadh. Used for month-length and schedule unlock rules.
 */
export function getRiyadhCalendarYmdParts(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Days in a Gregorian month when `month` is 1–12 (January = 1). */
export function getCalendarDaysInMonth(year: number, month1To12: number): number {
  return new Date(year, month1To12, 0).getDate();
}

/**
 * Schedule policy: next month becomes visible from the 22nd or the last 7 days of the current month (Riyadh).
 */
export function isRiyadhScheduleMonthUnlockWindow(): boolean {
  const { year, month, day } = getRiyadhCalendarYmdParts();
  const lastDay = getCalendarDaysInMonth(year, month);
  const inLast7 = day >= lastDay - 6;
  return day >= 22 || inLast7;
}

/** Friday YYYY-MM-DD from a Saturday week-start YYYY-MM-DD (UTC midnight anchor). */
export function weekEndYmdFromSaturdayWeekStart(weekStartYmd: string): string {
  const d = new Date(weekStartYmd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function nextMonthKeyAfterRiyadhCalendarMonth(year: number, month1To12: number): string {
  if (month1To12 === 12) return `${year + 1}-01`;
  return `${year}-${String(month1To12 + 1).padStart(2, '0')}`;
}

export type ScheduleEmployeeWeekVisibility = { allowed: true } | { allowed: false; reason: string };

/**
 * Employee schedule grid: may see full current month; next month only during unlock window (see isRiyadhScheduleMonthUnlockWindow).
 */
export function getScheduleEmployeeWeekVisibility(weekStartYmd: string): ScheduleEmployeeWeekVisibility {
  const weekEnd = weekEndYmdFromSaturdayWeekStart(weekStartYmd);
  const { year, month } = getRiyadhCalendarYmdParts();
  const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const firstDayCurrent = `${currentMonthPrefix}-01`;
  const nextMonthPrefix = nextMonthKeyAfterRiyadhCalendarMonth(year, month);

  if (weekEnd < firstDayCurrent) {
    return { allowed: false, reason: 'This week is before your allowed view range (current month).' };
  }
  const weekDates: string[] = [weekStartYmd];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(weekStartYmd + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const hasNextMonthDay = weekDates.some((dateStr) => dateStr.startsWith(`${nextMonthPrefix}-`));
  if (hasNextMonthDay && !isRiyadhScheduleMonthUnlockWindow()) {
    return {
      allowed: false,
      reason: 'Next month schedule is visible only from the 22nd or the last 7 days of the current month.',
    };
  }
  return { allowed: true };
}

/**
 * Minutes since midnight in Riyadh. `getRiyadhNow()` stores wall-clock components in UTC fields; use those here.
 */
export function getRiyadhWallClockMinutesSinceMidnight(): number {
  const r = getRiyadhNow();
  return r.getUTCHours() * 60 + r.getUTCMinutes();
}
