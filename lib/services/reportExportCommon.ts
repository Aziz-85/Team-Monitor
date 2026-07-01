/**
 * Shared helpers for Reports Export Center (date range, query parsing).
 */

export function parseExportBool(value: string | null | undefined, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

export function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDatesInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const d = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (d.getTime() <= end.getTime()) {
    out.push(toYmd(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function resolveSimpleDateRange(
  startDate?: string,
  endDate?: string
): { startDate: string; endDate: string } | { error: string } {
  const start = startDate?.trim() ?? '';
  const end = endDate?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { error: 'startDate and endDate required (YYYY-MM-DD)' };
  }
  if (start > end) {
    return { error: 'startDate must be on or before endDate' };
  }
  return { startDate: start, endDate: end };
}

export function dayName(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long' });
}

export function halalasToSar(halalas: number): number {
  return Math.round(halalas) / 100;
}

export function pctAchieved(achieved: number, target: number): number | '' {
  if (target <= 0) return '';
  return Math.round((achieved * 1000) / target) / 10;
}
