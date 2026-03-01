/**
 * Riyadh calendar day-of-week and date helpers for weekly-off and policy logic.
 * All date keys "YYYY-MM-DD" are Riyadh calendar days. Do not use UTC day-of-week for policy.
 */

import { toRiyadhDateString } from '@/lib/time';

/** Given a Date, return YYYY-MM-DD in Riyadh (canonical date key). */
export function toYmdRiyadh(date: Date): string {
  return toRiyadhDateString(date);
}

/**
 * Day-of-week 0..6 (Sun=0 .. Sat=6) for the given YYYY-MM-DD in Riyadh.
 * Uses noon UTC so the calendar day is unambiguous across timezones.
 */
export function getDowRiyadhFromYmd(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 0;
  const d = new Date(ymd + 'T12:00:00.000Z');
  return d.getUTCDay();
}

/** Inclusive: whether ymd is in [start, end] (YYYY-MM-DD strings). */
export function isBetweenYmd(ymd: string, start: string, end: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return ymd >= start && ymd <= end;
}
