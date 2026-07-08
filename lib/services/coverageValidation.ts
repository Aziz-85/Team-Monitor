import { prisma } from '@/lib/db';
import { rosterForDate } from './roster';
import { evaluateCoverage, evaluateCoverageWithResolvedMins } from '@/lib/schedule/coveragePolicy';
import { resolveEditorDayCoverage } from '@/lib/boutique-config/editorPolicy';
import { formatSlotViolationMessage } from '@/lib/schedule/timeCoverageValidation';
import {
  formatCoverageWarnings,
  warningsFromValidationResults,
} from '@/lib/schedule/coverageWarningFormatter';

/**
 * Coverage Validation — VALIDATION + WARNINGS ONLY. Reads Schedule Engine output.
 * Does NOT modify base schedules, coverage rules, or auto-adjust shifts.
 *
 * Engine v3: counts and slot violations come from rosterForDate → getScheduleGridForWeek
 * (segment-aware engine projection). This module maps them onto legacy ValidationResult
 * types for dashboards, plus SLOT_COVERAGE entries from the engine's 30-minute slot check.
 * It never computes coverage itself.
 */

export type ValidationResultType =
  | 'MIN_AM'
  | 'MIN_PM'
  | 'AM_GT_PM'
  | 'AM_ON_FRIDAY'
  | 'PM_NOT_ABOVE_AM'
  | 'SLOT_COVERAGE';

export interface ValidationResult {
  type: ValidationResultType;
  severity: 'warning';
  message: string;
  amCount: number;
  pmCount: number;
  minAm: number;
  minPm: number;
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const cache = new Map<
  string,
  { result: ValidationResult[]; timestamp: number }
>();

function toDateKey(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}


export type ValidateCoverageOptions = { boutiqueIds?: string[] };

/**
 * Validates daily coverage from engine output:
 * - AM/PM bucket policy (legacy dashboard types) using segment-derived counts
 * - 30-minute slot coverage (SLOT_COVERAGE) read from grid.timeCoverage
 */
export async function validateCoverage(
  date: Date,
  options: ValidateCoverageOptions = {}
): Promise<ValidationResult[]> {
  const dateKey = toDateKey(date);
  const cacheKey = options.boutiqueIds?.length ? `${dateKey}:${options.boutiqueIds.join(',')}` : dateKey;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const roster = await rosterForDate(date, options);
  const amCount = roster.amEmployees.length;
  const pmCount = roster.pmEmployees.length;
  const dayOfWeek = new Date(dateKey + 'T12:00:00Z').getUTCDay();

  if (process.env.DEBUG_SCHEDULE_SUGGESTIONS === '1') {
    // eslint-disable-next-line no-console
    console.log('[coverageValidation.validateCoverage]', {
      dateKey,
      boutiqueIds: options.boutiqueIds,
      amCount,
      pmCount,
      dayOfWeek,
    });
  }

  const rule = await prisma.coverageRule.findFirst({
    where: { dayOfWeek, enabled: true },
    select: { minAM: true, minPM: true },
  });
  let minAm = rule?.minAM ?? 0;
  let minPm = rule?.minPM ?? 0;
  let policyIssues;
  if (options.boutiqueIds?.length === 1) {
    const boutiqueMins = await resolveEditorDayCoverage(options.boutiqueIds[0], dateKey);
    minAm = boutiqueMins.minMorning;
    minPm = boutiqueMins.minEvening;
    policyIssues = evaluateCoverageWithResolvedMins(
      { am: amCount, pm: pmCount },
      boutiqueMins.dayOfWeek,
      minAm,
      minPm
    );
  } else {
    policyIssues = evaluateCoverage({ am: amCount, pm: pmCount }, dayOfWeek, minAm, minPm);
  }

  const typeMap: Record<string, ValidationResultType> = {
    AM_ON_FRIDAY: 'AM_ON_FRIDAY',
    AM_BELOW_MIN: 'MIN_AM',
    PM_BELOW_MIN: 'MIN_PM',
    PM_NOT_ABOVE_AM: 'PM_NOT_ABOVE_AM',
  };

  const results: ValidationResult[] = policyIssues.map((issue) => ({
    type: typeMap[issue.type] ?? 'MIN_PM',
    severity: 'warning',
    message: issue.message,
    amCount,
    pmCount,
    minAm: issue.minAm,
    minPm: issue.minPm,
  }));

  /** Legacy alias for dashboards still keying on AM_GT_PM */
  if (results.some((r) => r.type === 'PM_NOT_ABOVE_AM')) {
    results.push({
      type: 'AM_GT_PM',
      severity: 'warning',
      message: `AM (${amCount}) > PM (${pmCount}); PM must be at least AM`,
      amCount,
      pmCount,
      minAm: results[0]?.minAm ?? minAm,
      minPm: results[0]?.minPm ?? minPm,
    });
  }

  /** Engine slot validation — read directly, never recomputed. */
  for (const v of roster.slotViolations ?? []) {
    results.push({
      type: 'SLOT_COVERAGE',
      severity: 'warning',
      message: formatSlotViolationMessage(v),
      amCount,
      pmCount,
      minAm,
      minPm,
    });
  }

  cache.set(cacheKey, { result: results, timestamp: Date.now() });
  return results;
}

/** Clear cache (e.g. when overrides, leaves, or coverage rules change). Call from API routes that mutate those. */
export function clearCoverageValidationCache(): void {
  cache.clear();
}

/** Helper: human-readable summary for tooltips/UI */
export function formatValidationSummary(results: ValidationResult[]): string {
  if (!results.length) return '';
  const formatted = formatCoverageWarnings(warningsFromValidationResults('unknown', results));
  return formatted.summaryLine ?? results[0]?.message ?? '';
}
