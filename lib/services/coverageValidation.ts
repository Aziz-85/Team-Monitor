import { prisma } from '@/lib/db';
import { rosterForDate } from './roster';

/**
 * Coverage Validation Engine – VALIDATION + WARNINGS ONLY.
 * Does NOT modify base schedules, coverage rules, or auto-adjust shifts.
 * Computed on the fly; not persisted to DB.
 */

export type ValidationResultType = 'MIN_AM' | 'MIN_PM' | 'AM_GT_PM' | 'AM_ON_FRIDAY';

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

const FRIDAY_DAY_OF_WEEK = 5;

export type ValidateCoverageOptions = { boutiqueIds?: string[] };

/**
 * Validates daily coverage for a date using:
 * - Coverage Rules (min AM / min PM per weekday)
 * - Effective Coverage Policy (PM-dominant): PM must be ≥ AM, PM must be at least 2 (Sat–Thu);
 *   Friday is PM-only (effective Min AM = 0). Min AM is informational (not enforced) on all days.
 * Data: base shifts + day overrides + leave (effective availability from roster).
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
  const isFriday = dayOfWeek === FRIDAY_DAY_OF_WEEK;

  const rule = await prisma.coverageRule.findFirst({
    where: { dayOfWeek, enabled: true },
    select: { minAM: true, minPM: true },
  });
  const minAm = rule?.minAM ?? 0;
  /** Effective Min PM: Sat–Thu = at least 2; Friday uses rule (PM-only day). */
  const effectiveMinPm = isFriday ? (rule?.minPM ?? 0) : (rule ? Math.max(rule.minPM ?? 0, 2) : 2);

  const results: ValidationResult[] = [];

  /** Friday: AM not allowed (PM-only). Effective Min AM = 0. */
  if (isFriday && amCount > 0) {
    results.push({
      type: 'AM_ON_FRIDAY',
      severity: 'warning',
      message: `Friday is PM-only; AM (${amCount}) must be 0`,
      amCount,
      pmCount,
      minAm: 0,
      minPm: rule?.minPM ?? 0,
    });
  }

  /** Sat–Thu: enforce PM ≥ 2. Min AM is informational only (not enforced). */
  if (!isFriday && rule && pmCount < effectiveMinPm) {
    results.push({
      type: 'MIN_PM',
      severity: 'warning',
      message: `PM count (${pmCount}) is below minimum (${effectiveMinPm})`,
      amCount,
      pmCount,
      minAm: minAm,
      minPm: effectiveMinPm,
    });
  }

  /** Business rule: PM must be ≥ AM (Sat–Thu). Friday is AM-only so AM > PM is allowed. */
  if (!isFriday && amCount > pmCount) {
    results.push({
      type: 'AM_GT_PM',
      severity: 'warning',
      message: `AM (${amCount}) > PM (${pmCount})`,
      amCount,
      pmCount,
      minAm: minAm,
      minPm: effectiveMinPm,
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
  return results.map((r) => r.message).join('; ');
}
