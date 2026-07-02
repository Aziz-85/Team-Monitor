/**
 * UI-only helpers for Schedule Editor v3 — does not calculate engine coverage.
 * Reads engine output already on the grid (timeCoverage, segments, counts).
 */

import type { DayCountContext } from '@/lib/services/scheduleGrid';
import type { SlotViolation } from '@/lib/schedule/generateSchedule/types';

export type ShiftSegmentPreview = { startTime: string; endTime: string; periodIndex?: number };

export type ScheduleQualityMetrics = {
  coverageValid: boolean;
  slotViolationCount: number;
  splitCount: number;
  overtimeCount: number;
  externalSupportCount: number;
};

export type ValidationResult = {
  type: string;
  message: string;
  amCount?: number;
  pmCount?: number;
  minAm?: number;
};

export type WarningGroup = 'coverage' | 'handover' | 'keyHolder' | 'policy';

export type GroupedWarning = {
  id: string;
  group: WarningGroup;
  message: string;
  date?: string;
};

const HANDOVER_CODES = new Set([
  'CONTINUITY_RISK',
  'HANDOVER_REQUIRED_BETWEEN_DAYS',
  'NO_SAFE_NEXT_AM_RECEIVER',
  'MISSING_HANDOVER_TO_NEXT_AM',
  'MANUAL_OVERRIDE_BREAKS_CONTINUITY',
  'SUGGESTION_REDUCED_CONTINUITY_RISK',
]);

const KEY_HOLDER_CODES = new Set([
  'MISSING_AM_HOLDER',
  'MISSING_PM_HOLDER',
  'AM_EQ_PM',
  'AM_NOT_ELIGIBLE',
  'PM_NOT_ELIGIBLE',
  'AM_NOT_SCHEDULED',
  'PM_NOT_SCHEDULED',
  'NO_SUGGESTION_AM',
  'NO_SUGGESTION_PM',
  'MULTIPLE_VALID_OPTIONS_MANUAL_REVIEW',
]);

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

function segmentHours(startTime: string, endTime: string): number {
  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

export function formatSegmentPreview(segments?: ShiftSegmentPreview[]): string | null {
  if (!segments?.length) return null;
  return segments.map((s) => `${s.startTime}–${s.endTime}`).join(' / ');
}

export function computeScheduleQualityMetrics(input: {
  rows: Array<{
    cells: Array<{
      date: string;
      availability: string;
      effectiveShift: string;
      segments?: ShiftSegmentPreview[];
    }>;
  }>;
  timeCoverage: { valid: boolean; violations: SlotViolation[] };
  externalSupportCount: number;
  dayCountContexts?: DayCountContext[];
  getEffectiveShift?: (cell: { effectiveShift: string }) => string;
}): ScheduleQualityMetrics {
  const ctxByDate = new Map((input.dayCountContexts ?? []).map((c) => [c.date, c]));
  let splitCount = 0;
  let overtimeCount = 0;

  for (const row of input.rows) {
    for (const cell of row.cells) {
      if (cell.availability !== 'WORK') continue;
      const shift = input.getEffectiveShift?.(cell) ?? cell.effectiveShift;
      if (shift === 'SPLIT') splitCount++;
      const segments = cell.segments;
      if (segments?.length && cell.date) {
        const ctx = ctxByDate.get(cell.date);
        const hours = segments.reduce((sum, s) => sum + segmentHours(s.startTime, s.endTime), 0);
        if (ctx && hours > ctx.maxDailyHours) overtimeCount++;
      }
    }
  }

  return {
    coverageValid: input.timeCoverage.valid,
    slotViolationCount: input.timeCoverage.violations.length,
    splitCount,
    overtimeCount,
    externalSupportCount: input.externalSupportCount,
  };
}

/** Group flat warnings for compact UI display. */
export function buildGroupedWarnings(input: {
  validationsByDay: Array<{ date: string; validations: ValidationResult[] }>;
  keyPlanWarnings?: Array<{ date: string; code: string; message: string }>;
  integrityWarnings?: string[];
}): GroupedWarning[] {
  const out: GroupedWarning[] = [];

  for (const iw of input.integrityWarnings ?? []) {
    out.push({ id: `policy-${iw.slice(0, 40)}`, group: 'policy', message: iw });
  }

  for (const { date, validations } of input.validationsByDay) {
    for (const v of validations) {
      out.push({
        id: `${date}-${v.type}-${v.message.slice(0, 24)}`,
        group: 'coverage',
        message: v.message,
        date,
      });
    }
  }

  for (const w of input.keyPlanWarnings ?? []) {
    let group: WarningGroup = 'keyHolder';
    if (HANDOVER_CODES.has(w.code)) group = 'handover';
    else if (KEY_HOLDER_CODES.has(w.code)) group = 'keyHolder';
    out.push({
      id: `${w.date}-${w.code}`,
      group,
      message: w.message,
      date: w.date,
    });
  }

  return out;
}

/** Summarize coverage warnings for collapsed list (not per-day spam). */
export function summarizeCoverageWarnings(
  validationsByDay: Array<{ date: string; validations: ValidationResult[]; dayOfWeek?: number }>
): Array<{ key: string; label: string; dates: string[] }> {
  const buckets = new Map<string, string[]>();

  for (const { date, validations, dayOfWeek } of validationsByDay) {
    for (const v of validations) {
      if (v.type === 'SLOT_COVERAGE') {
        const k = 'slot';
        buckets.set(k, [...(buckets.get(k) ?? []), date]);
      } else if (v.type === 'MIN_AM') {
        const k = dayOfWeek === 5 ? 'min_am_fri' : 'min_am';
        if (dayOfWeek !== 5) buckets.set(k, [...(buckets.get(k) ?? []), date]);
      } else if (v.type === 'MIN_PM') {
        buckets.set('min_pm', [...(buckets.get('min_pm') ?? []), date]);
      } else if (v.type === 'RASHID_OVERFLOW') {
        buckets.set('rashid', [...(buckets.get('rashid') ?? []), date]);
      }
    }
  }

  return Array.from(buckets.entries()).map(([key, dates]) => ({
    key,
    label: `schedule.warnings.coverage.${key}`,
    dates: Array.from(new Set(dates)),
  }));
}
