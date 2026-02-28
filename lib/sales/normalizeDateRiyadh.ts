/**
 * Normalize date to daily boundary in Asia/Riyadh for sales ledger.
 * All daily sales are keyed by this date (start-of-day in Riyadh).
 */

import { toRiyadhDateOnly, toRiyadhDateString } from '@/lib/time';

const DATE_STRING_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse YYYY-MM-DD string and return Date at 00:00 for that calendar day (Riyadh).
 * Invalid or missing input returns today in Riyadh.
 */
export function parseDateRiyadh(input: string | null | undefined): Date {
  if (input == null || typeof input !== 'string') {
    return toRiyadhDateOnly(new Date());
  }
  const trimmed = input.trim();
  const match = trimmed.match(DATE_STRING_REGEX);
  if (!match) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return toRiyadhDateOnly(parsed);
    return toRiyadhDateOnly(new Date());
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return toRiyadhDateOnly(new Date());
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Normalize any date to the date-only boundary in Asia/Riyadh.
 */
export function normalizeDateRiyadh(date: Date): Date {
  return toRiyadhDateOnly(date);
}

/**
 * Format a Date as YYYY-MM-DD in Riyadh (for API responses and queries).
 */
export function formatDateRiyadh(date: Date): string {
  return toRiyadhDateString(date);
}
