/**
 * Closed-period rules for admin historical SalesEntry imports (Asia/Riyadh).
 * Initial import targets past closed months by default (not the current calendar month).
 */

import { getCurrentMonthKeyRiyadh, getRiyadhNow, toRiyadhDateString } from '@/lib/time';

/** YYYY-MM string comparison (lexicographic works for ISO months). */
export function isMonthBeforeCurrentMonthRiyadh(monthKey: string): boolean {
  const cur = getCurrentMonthKeyRiyadh();
  return monthKey < cur;
}

/**
 * Historical initial import: allow only dates in months **strictly before** the current month in Riyadh.
 * (Blocks importing into the current open month by mistake.)
 */
export function isDateKeyAllowedForHistoricalInitial(dateKey: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return false;
  const monthKey = `${m[1]}-${m[2]}`;
  if (!isMonthBeforeCurrentMonthRiyadh(monthKey)) return false;
  const todayKey = toRiyadhDateString(getRiyadhNow());
  if (dateKey > todayKey) return false;
  return true;
}

/**
 * Correction import: same period window as initial by default (past closed months only).
 */
export function isDateKeyAllowedForHistoricalCorrection(dateKey: string): boolean {
  return isDateKeyAllowedForHistoricalInitial(dateKey);
}
