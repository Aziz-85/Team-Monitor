/**
 * Compact, grouped coverage warnings for manager-facing UI.
 * Collapses per-slot noise into day + period summaries.
 */

import type { SlotViolation } from '@/lib/schedule/generateSchedule/types';

export type CoverageWarningInput = {
  date: string;
  dayName?: string;
  dayOfWeek?: number;
  type: string;
  message?: string;
  amCount?: number;
  pmCount?: number;
  minAm?: number;
  minPm?: number;
  startTime?: string;
  endTime?: string;
  coverage?: number;
  minCoverage?: number;
  periodIndex?: number;
};

export type ShortageType = 'AM' | 'PM' | 'GAP' | 'OTHER';

export type GroupedDayWarningItem = {
  shortageType: ShortageType;
  label: string;
  periodRange?: string;
  required?: number;
  available?: number;
  detail: string;
};

export type GroupedDayWarning = {
  date: string;
  dayName?: string;
  items: GroupedDayWarningItem[];
};

export type FormattedCoverageWarnings = {
  summaryLine: string | null;
  groupedByDay: GroupedDayWarning[];
  severeCount: number;
  totalAffectedDays: number;
  compactItems: string[];
};

const BUCKET_TYPES = new Set(['MIN_AM', 'MIN_PM', 'AM_GT_PM', 'PM_NOT_ABOVE_AM', 'AM_ON_FRIDAY']);

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

function inferShortageType(w: CoverageWarningInput): ShortageType {
  if (w.type === 'MIN_AM' || w.type === 'AM_ON_FRIDAY') return 'AM';
  if (w.type === 'MIN_PM') return 'PM';
  if (w.type === 'AM_GT_PM' || w.type === 'PM_NOT_ABOVE_AM') return 'PM';
  if (w.type === 'SLOT_COVERAGE' || w.startTime) {
    if (w.periodIndex === 1) return 'PM';
    if (w.periodIndex === 0) return 'AM';
    if (w.startTime) {
      return parseMinutes(w.startTime) >= 15 * 60 ? 'PM' : 'AM';
    }
    return 'GAP';
  }
  return 'OTHER';
}

function shortageLabel(type: ShortageType): string {
  switch (type) {
    case 'AM':
      return 'AM coverage shortage';
    case 'PM':
      return 'PM coverage shortage';
    case 'GAP':
      return 'Coverage gap';
    default:
      return 'Coverage issue';
  }
}

function dedupeKey(w: CoverageWarningInput): string {
  const type = inferShortageType(w);
  if (BUCKET_TYPES.has(w.type)) {
    return `${w.date}|bucket|${type}|${w.type}`;
  }
  return `${w.date}|slot|${type}|${w.startTime ?? ''}|${w.endTime ?? ''}|${w.message ?? ''}`;
}

function mergePeriodRange(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const [aStart, aEnd] = a.split('–');
  const [bStart, bEnd] = b.split('–');
  if (!aStart || !aEnd || !bStart || !bEnd) return a;
  const start = parseMinutes(aStart) <= parseMinutes(bStart) ? aStart : bStart;
  const end = parseMinutes(aEnd) >= parseMinutes(bEnd) ? aEnd : bEnd;
  return `${start}–${end}`;
}

function buildItemDetail(
  label: string,
  periodRange?: string,
  required?: number,
  available?: number
): string {
  const parts: string[] = [label];
  if (periodRange) parts.push(`from ${periodRange}`);
  if (required != null && available != null) {
    parts.push(`Required ${required}, available ${available}`);
  }
  return parts.join(' · ');
}

function addBucketItem(
  dayMap: Map<string, GroupedDayWarning>,
  w: CoverageWarningInput
): void {
  const shortageType = inferShortageType(w);
  const day = dayMap.get(w.date) ?? {
    date: w.date,
    dayName: w.dayName,
    items: [],
  };

  const required =
    shortageType === 'AM'
      ? w.minAm ?? w.minPm
      : shortageType === 'PM'
        ? w.minPm ?? w.minAm
        : w.minCoverage;
  const available =
    shortageType === 'AM' ? w.amCount : shortageType === 'PM' ? w.pmCount : w.coverage;

  const label = shortageLabel(shortageType);
  const detail = buildItemDetail(label, undefined, required, available);

  const exists = day.items.some(
    (i) => i.shortageType === shortageType && i.periodRange == null && i.label === label
  );
  if (!exists) {
    day.items.push({
      shortageType,
      label,
      required,
      available,
      detail,
    });
  }
  dayMap.set(w.date, day);
}

function addSlotItem(
  dayMap: Map<string, GroupedDayWarning>,
  w: CoverageWarningInput
): void {
  const shortageType = inferShortageType(w);
  const periodRange =
    w.startTime && w.endTime ? `${w.startTime}–${w.endTime}` : undefined;
  const day = dayMap.get(w.date) ?? {
    date: w.date,
    dayName: w.dayName,
    items: [],
  };

  const existing = day.items.find(
    (i) => i.shortageType === shortageType && i.periodRange != null
  );

  if (existing) {
    existing.periodRange = mergePeriodRange(existing.periodRange, periodRange);
    existing.required = Math.max(existing.required ?? 0, w.minCoverage ?? 0);
    existing.available = Math.min(
      existing.available ?? Number.MAX_SAFE_INTEGER,
      w.coverage ?? 0
    );
    existing.detail = buildItemDetail(
      existing.label,
      existing.periodRange,
      existing.required,
      existing.available
    );
  } else {
    const label = shortageLabel(shortageType);
    day.items.push({
      shortageType,
      label,
      periodRange,
      required: w.minCoverage,
      available: w.coverage,
      detail: buildItemDetail(label, periodRange, w.minCoverage, w.coverage),
    });
  }
  dayMap.set(w.date, day);
}

/** Deduplicate raw warnings before grouping. */
export function dedupeCoverageWarnings(warnings: CoverageWarningInput[]): CoverageWarningInput[] {
  const seen = new Set<string>();
  const out: CoverageWarningInput[] = [];
  for (const w of warnings) {
    const key = dedupeKey(w);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export function formatCoverageWarnings(
  warnings: CoverageWarningInput[]
): FormattedCoverageWarnings {
  const unique = dedupeCoverageWarnings(warnings);
  if (!unique.length) {
    return {
      summaryLine: null,
      groupedByDay: [],
      severeCount: 0,
      totalAffectedDays: 0,
      compactItems: [],
    };
  }

  const dayMap = new Map<string, GroupedDayWarning>();
  const bucketDays = new Set<string>();

  for (const w of unique) {
    if (BUCKET_TYPES.has(w.type)) {
      bucketDays.add(w.date);
      addBucketItem(dayMap, w);
      continue;
    }
    if (w.type === 'SLOT_COVERAGE' || w.startTime) {
      if (bucketDays.has(w.date)) {
        const shortageType = inferShortageType(w);
        const day = dayMap.get(w.date);
        const bucketItem = day?.items.find((i) => i.shortageType === shortageType && !i.periodRange);
        if (bucketItem) {
          const periodRange =
            w.startTime && w.endTime ? `${w.startTime}–${w.endTime}` : undefined;
          bucketItem.periodRange = mergePeriodRange(bucketItem.periodRange, periodRange);
          bucketItem.detail = buildItemDetail(
            bucketItem.label,
            bucketItem.periodRange,
            bucketItem.required,
            bucketItem.available
          );
          continue;
        }
      }
      addSlotItem(dayMap, w);
      continue;
    }
    addBucketItem(dayMap, w);
  }

  const groupedByDay = Array.from(dayMap.values())
    .filter((d) => d.items.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalAffectedDays = groupedByDay.length;
  const pmDays = groupedByDay.filter((d) => d.items.some((i) => i.shortageType === 'PM')).length;
  const amDays = groupedByDay.filter((d) => d.items.some((i) => i.shortageType === 'AM')).length;
  const severeCount = groupedByDay.reduce(
    (n, d) => n + d.items.filter((i) => (i.available ?? 0) === 0).length,
    0
  );

  let summaryLine: string;
  if (pmDays > 0 && amDays === 0) {
    summaryLine = `Coverage needs attention: ${pmDays} day${pmDays === 1 ? '' : 's'} have PM shortage.`;
  } else if (amDays > 0 && pmDays === 0) {
    summaryLine = `Coverage needs attention: ${amDays} day${amDays === 1 ? '' : 's'} have AM shortage.`;
  } else {
    summaryLine = `Coverage needs attention: ${totalAffectedDays} day${totalAffectedDays === 1 ? '' : 's'} affected.`;
  }

  const compactItems = groupedByDay.slice(0, 3).map((d) => {
    const primary = d.items[0];
    const name = d.dayName ?? d.date;
    return `${name}: ${primary?.label ?? 'Coverage issue'}`;
  });

  return {
    summaryLine,
    groupedByDay,
    severeCount,
    totalAffectedDays,
    compactItems,
  };
}

export function warningsFromValidationResults(
  date: string,
  validations: Array<{
    type: string;
    message?: string;
    amCount?: number;
    pmCount?: number;
    minAm?: number;
    minPm?: number;
  }>,
  meta?: { dayName?: string; dayOfWeek?: number }
): CoverageWarningInput[] {
  return validations.map((v) => ({
    date,
    dayName: meta?.dayName,
    dayOfWeek: meta?.dayOfWeek,
    type: v.type,
    message: v.message,
    amCount: v.amCount,
    pmCount: v.pmCount,
    minAm: v.minAm,
    minPm: v.minPm,
  }));
}

export function warningsFromSlotViolations(
  violations: SlotViolation[],
  dayMeta?: Map<string, { dayName?: string; dayOfWeek?: number }>
): CoverageWarningInput[] {
  return violations.map((v) => ({
    date: v.date,
    dayName: dayMeta?.get(v.date)?.dayName,
    dayOfWeek: dayMeta?.get(v.date)?.dayOfWeek,
    type: 'SLOT_COVERAGE',
    startTime: v.startTime,
    endTime: v.endTime,
    coverage: v.coverage,
    minCoverage: v.minCoverage,
  }));
}

export function warningsFromValidationsByDay(
  days: Array<{
    date: string;
    dayName?: string;
    dayOfWeek?: number;
    validations: Array<{
      type: string;
      message?: string;
      amCount?: number;
      pmCount?: number;
      minAm?: number;
      minPm?: number;
    }>;
  }>
): CoverageWarningInput[] {
  return days.flatMap((d) =>
    warningsFromValidationResults(d.date, d.validations, {
      dayName: d.dayName,
      dayOfWeek: d.dayOfWeek,
    })
  );
}

export function warningsFromWeekSummary(
  days: Array<{ date: string; dayName?: string; messages: string[] }>,
  validationsByDate?: Map<
    string,
    Array<{ type: string; amCount?: number; pmCount?: number; minAm?: number; minPm?: number }>
  >
): CoverageWarningInput[] {
  const out: CoverageWarningInput[] = [];
  for (const d of days) {
    const vals = validationsByDate?.get(d.date);
    if (vals?.length) {
      out.push(...warningsFromValidationResults(d.date, vals, { dayName: d.dayName }));
    } else {
      for (const msg of d.messages) {
        const pm = /PM\s*\((\d+)\)/i.exec(msg);
        const am = /AM\s*\((\d+)\)/i.exec(msg);
        const minPm = /< (\d+)/.exec(msg);
        out.push({
          date: d.date,
          dayName: d.dayName,
          type: pm ? 'MIN_PM' : am ? 'MIN_AM' : 'OTHER',
          message: msg,
          pmCount: pm ? Number(pm[1]) : undefined,
          amCount: am ? Number(am[1]) : undefined,
          minPm: minPm ? Number(minPm[1]) : undefined,
        });
      }
    }
  }
  return out;
}
