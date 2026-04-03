/**
 * Task list / monitor date windows — Asia/Riyadh via lib/time (single source of truth).
 */

import {
  formatDateRiyadh,
  getMonthRangeDayKeys,
  getRiyadhNow,
  normalizeDateOnlyRiyadh,
  normalizeMonthKey,
} from '@/lib/time';

export function getRiyadhTaskListToday(): { dateStr: string; date: Date } {
  const dateStr = formatDateRiyadh(getRiyadhNow());
  return { dateStr, date: normalizeDateOnlyRiyadh(dateStr) };
}

/** Sat–Fri as YYYY-MM-DD; anchor is any calendar day in that week (typically today). */
export function getSaturdayWeekYmdKeysForAnchor(anchorYmd: string): string[] {
  const d = new Date(anchorYmd + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = (day - 6 + 7) % 7;
  const sat = new Date(d);
  sat.setUTCDate(sat.getUTCDate() - diff);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(sat);
    x.setUTCDate(sat.getUTCDate() + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

export function getOverdueYmdKeysBefore(anchorYmd: string, capDays: number): string[] {
  const out: string[] = [];
  const end = new Date(anchorYmd + 'T00:00:00Z');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - capDays);
  const cur = new Date(start);
  while (cur < end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** All YYYY-MM-DD keys in the calendar month containing anchorYmd (Riyadh month boundaries via month key). */
export function getMonthYmdKeysForAnchorDay(anchorYmd: string): string[] {
  const monthKey = normalizeMonthKey(anchorYmd.slice(0, 7));
  return getMonthRangeDayKeys(monthKey).keys;
}
