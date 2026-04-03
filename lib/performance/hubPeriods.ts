/**
 * Performance Hub — Riyadh calendar period windows (Asia/Riyadh).
 * Week: Saturday start (matches lib/time.getWeekRangeForDate).
 * Quarter: calendar Q1–Q4 (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec).
 * Half-year: H1 Jan–Jun, H2 Jul–Dec.
 * Year: Jan 1 .. Jan 1 (next year), exclusive end.
 */

import {
  addDays,
  formatMonthKey,
  getDaysInMonth,
  getMonthRange,
  getWeekRangeForDate,
  normalizeMonthKey,
  toRiyadhDateString,
} from '@/lib/time';

export type HubPeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'half' | 'year';

export type PeriodWindow = {
  kind: HubPeriodKind;
  /** Inclusive start (UTC midnight, Riyadh calendar day). */
  from: Date;
  /** Exclusive end. */
  toExclusive: Date;
  /** Human label (for tables / API). */
  label: string;
};

function parseAnchor(anchorDateKey: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchorDateKey.trim());
  if (!m) {
    return new Date(toRiyadhDateString(new Date()) + 'T00:00:00.000Z');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

/** Calendar quarter 1–4 from Riyadh month 1–12. */
export function quarterIndexFromMonth(month1to12: number): 1 | 2 | 3 | 4 {
  if (month1to12 <= 3) return 1;
  if (month1to12 <= 6) return 2;
  if (month1to12 <= 9) return 3;
  return 4;
}

export function resolvePeriodWindow(kind: HubPeriodKind, anchorDateKey: string): PeriodWindow {
  const anchor = parseAnchor(anchorDateKey);
  const ymd = toRiyadhDateString(anchor);
  const [y, mo, d] = ymd.split('-').map(Number);

  if (kind === 'day') {
    const from = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
    const toExclusive = addDays(from, 1);
    return { kind, from, toExclusive, label: ymd };
  }

  if (kind === 'week') {
    const { startSat, endExclusiveFriPlus1 } = getWeekRangeForDate(anchor);
    return {
      kind,
      from: startSat,
      toExclusive: endExclusiveFriPlus1,
      label: `${toRiyadhDateString(startSat)} – ${toRiyadhDateString(addDays(endExclusiveFriPlus1, -1))}`,
    };
  }

  if (kind === 'month') {
    const mk = `${y}-${String(mo).padStart(2, '0')}`;
    const { start, endExclusive } = getMonthRange(mk);
    return {
      kind,
      from: start,
      toExclusive: endExclusive,
      label: normalizeMonthKey(mk),
    };
  }

  if (kind === 'quarter') {
    const q = quarterIndexFromMonth(mo);
    const startMonth = (q - 1) * 3 + 1;
    const from = new Date(Date.UTC(y, startMonth - 1, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(y, startMonth + 2, 1, 0, 0, 0, 0));
    return {
      kind,
      from,
      toExclusive: endExclusive,
      label: `${y} Q${q}`,
    };
  }

  if (kind === 'half') {
    const half = mo <= 6 ? 1 : 2;
    const startMonth = half === 1 ? 1 : 7;
    const from = new Date(Date.UTC(y, startMonth - 1, 1, 0, 0, 0, 0));
    const endExclusive =
      half === 1
        ? new Date(Date.UTC(y, 6, 1, 0, 0, 0, 0))
        : new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
    return {
      kind,
      from,
      toExclusive: endExclusive,
      label: `${y} H${half}`,
    };
  }

  /* year */
  const from = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
  const toExclusive = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
  return { kind, from, toExclusive, label: String(y) };
}

export type ChartBucket = { key: string; label: string; from: Date; toExclusive: Date };

/**
 * Sub-periods for Actual vs Target chart inside the selected window.
 * Day: single bucket. Week: 7 days. Month: calendar days. Quarter: 3 months. Half: 6 months. Year: 12 months.
 */
export function chartBucketsForPeriod(window: PeriodWindow): ChartBucket[] {
  const { kind, from, toExclusive } = window;

  if (kind === 'day') {
    return [
      {
        key: toRiyadhDateString(from),
        label: toRiyadhDateString(from),
        from,
        toExclusive,
      },
    ];
  }

  if (kind === 'week') {
    const out: ChartBucket[] = [];
    for (let cur = new Date(from); cur < toExclusive; cur = addDays(cur, 1)) {
      const k = toRiyadhDateString(cur);
      const next = addDays(cur, 1);
      out.push({ key: k, label: k.slice(8), from: cur, toExclusive: next });
    }
    return out;
  }

  if (kind === 'month') {
    const mk = formatMonthKey(from);
    const dim = getDaysInMonth(mk);
    const [yy, mm] = mk.split('-').map(Number);
    const out: ChartBucket[] = [];
    for (let dom = 1; dom <= dim; dom++) {
      const dayFrom = new Date(Date.UTC(yy, mm - 1, dom, 0, 0, 0, 0));
      const dayTo = addDays(dayFrom, 1);
      const key = `${mk}-${String(dom).padStart(2, '0')}`;
      out.push({ key, label: String(dom), from: dayFrom, toExclusive: dayTo });
    }
    return out;
  }

  if (kind === 'quarter') {
    const out: ChartBucket[] = [];
    let cur = new Date(from);
    while (cur < toExclusive) {
      const mk = formatMonthKey(cur);
      const { start, endExclusive } = getMonthRange(mk);
      out.push({
        key: mk,
        label: mk,
        from: start,
        toExclusive: endExclusive,
      });
      cur = endExclusive;
    }
    return out;
  }

  if (kind === 'half') {
    const out: ChartBucket[] = [];
    let cur = new Date(from);
    while (cur < toExclusive) {
      const mk = formatMonthKey(cur);
      const { start, endExclusive } = getMonthRange(mk);
      out.push({
        key: mk,
        label: mk,
        from: start,
        toExclusive: endExclusive,
      });
      cur = endExclusive;
    }
    return out;
  }

  /* year — monthly buckets */
  const out: ChartBucket[] = [];
  let cur = new Date(from);
  while (cur < toExclusive) {
    const mk = formatMonthKey(cur);
    const { start, endExclusive } = getMonthRange(mk);
    out.push({
      key: mk,
      label: mk,
      from: start,
      toExclusive: endExclusive,
    });
    cur = endExclusive;
  }
  return out;
}
