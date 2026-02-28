import type { TaskScheduleType } from '@prisma/client';

/** Type code for taskKey: DAILY=>DLY, WEEKLY=>WKY, MONTHLY=>MLY. */
export function getTypeCode(type: TaskScheduleType | string): string {
  switch (type) {
    case 'DAILY':
      return 'DLY';
    case 'WEEKLY':
      return 'WKY';
    case 'MONTHLY':
      return 'MLY';
    default:
      return 'WKY';
  }
}

/** Extract zone from task name (e.g. "Weekly Inventory – Zone C" => "C") or "NA". */
export function getZoneFromTaskName(name: string): string {
  const m = name.match(/\bZone\s+([A-Za-z0-9]+)\b/i) || name.match(/\bzone\s*[:=]\s*([A-Za-z0-9]+)/i);
  return m ? m[1].toUpperCase().slice(0, 8) : 'NA';
}

/**
 * Parse periodKey "2026-W13" => { year, weekNum }.
 * W is week number (1-53); interpreted as Saturday-based week (Sync/Schedule convention).
 */
export function parseWeekPeriodKey(periodKey: string): { year: number; weekNum: number } | null {
  const m = periodKey.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const weekNum = parseInt(m[2], 10);
  if (weekNum < 1 || weekNum > 53) return null;
  return { year, weekNum };
}

/**
 * Get Saturday (weekStart) for Saturday-based week number.
 * Week 1 = week containing first Saturday of year. Aligns with lib/utils/week and Schedule.
 */
export function getWeekStartDateSaturday(year: number, weekNum: number): Date {
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const startDay = startOfYear.getUTCDay();
  const firstSaturdayOffset = (6 - startDay + 7) % 7;
  const firstSat = new Date(Date.UTC(year, 0, 1 + firstSaturdayOffset));
  const sat = new Date(firstSat);
  sat.setUTCDate(firstSat.getUTCDate() + (weekNum - 1) * 7);
  return sat;
}

/**
 * periodKey "2026-W07" => weekStart string "YYYY-MM-DD" (Saturday).
 * Uses Saturday-based week (same as Schedule module / lib/utils/week).
 */
export function getWeekStartFromPeriodKey(periodKey: string): string | null {
  const p = parseWeekPeriodKey(periodKey);
  if (!p) return null;
  const d = getWeekStartDateSaturday(p.year, p.weekNum);
  return d.toISOString().slice(0, 10);
}

/**
 * periodKey "2026-02" => { year, month }.
 */
export function parseMonthPeriodKey(periodKey: string): { year: number; month: number } | null {
  const m = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return { year: parseInt(m[1], 10), month };
}

export function getQuarter(year: number, month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * Build taskKey: DT-{year}-Q{quarter}-W{weekNum}-{typeCode}-{zoneOrNA}-{seq4}.
 * Idempotent: same inputs => same key.
 */
export function buildTaskKey(
  year: number,
  quarter: number,
  weekNum: number,
  typeCode: string,
  zone: string,
  seq4: number
): string {
  const seq = String(seq4).padStart(4, '0');
  return `DT-${year}-Q${quarter}-W${weekNum}-${typeCode}-${zone}-${seq}`;
}

/** Extract taskKey from Planner title prefix "[DT-...-0001] Rest of title". */
export function extractTaskKeyFromTitle(title: string): string | null {
  const m = title.match(/^\[(DT-[A-Z0-9-]+)\]\s*/);
  return m ? m[1] : null;
}

/** Title with key prefix for export: "[taskKey] name". */
export function titleWithKey(taskKey: string, name: string): string {
  return `[${taskKey}] ${name}`;
}
