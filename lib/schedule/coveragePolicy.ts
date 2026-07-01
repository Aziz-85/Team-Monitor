/**
 * Canonical schedule coverage policy (Sat–Thu vs Friday).
 * Single source for validation, suggestions, and the schedule assistant planner.
 */

import { FRIDAY_DAY_OF_WEEK } from '@/lib/services/shift';

/** Minimum staff per shift (AM and PM) on Saturday–Thursday. */
export const MIN_PER_SHIFT_SAT_THU = 2;

export function isFridayDay(dayOfWeek: number): boolean {
  return dayOfWeek === FRIDAY_DAY_OF_WEEK;
}

/** Sat–Thu: at least 2 AM. Friday: 0 (PM-only). */
export function effectiveMinAm(dayOfWeek: number, ruleMinAm = 0): number {
  if (isFridayDay(dayOfWeek)) return 0;
  return Math.max(ruleMinAm, MIN_PER_SHIFT_SAT_THU);
}

/** Sat–Thu: at least 2 PM. Friday: rule min (often 2 in practice). */
export function effectiveMinPm(dayOfWeek: number, ruleMinPm = 0): number {
  if (isFridayDay(dayOfWeek)) return Math.max(ruleMinPm, 0);
  return Math.max(ruleMinPm, MIN_PER_SHIFT_SAT_THU);
}

/** Sat–Thu: PM must be strictly greater than AM. */
export function pmMustExceedAm(dayOfWeek: number): boolean {
  return !isFridayDay(dayOfWeek);
}

export type CoverageCounts = { am: number; pm: number };

export type CoverageViolation =
  | 'AM_ON_FRIDAY'
  | 'AM_BELOW_MIN'
  | 'PM_BELOW_MIN'
  | 'PM_NOT_ABOVE_AM';

export type CoverageIssue = {
  type: CoverageViolation;
  severity: 'critical' | 'warning';
  message: string;
  minAm: number;
  minPm: number;
};

export function evaluateCoverage(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0,
  ruleMinPm = 0
): CoverageIssue[] {
  const { am, pm } = counts;
  const minAm = effectiveMinAm(dayOfWeek, ruleMinAm);
  const minPm = effectiveMinPm(dayOfWeek, ruleMinPm);
  const issues: CoverageIssue[] = [];

  if (isFridayDay(dayOfWeek)) {
    if (am > 0) {
      issues.push({
        type: 'AM_ON_FRIDAY',
        severity: 'critical',
        message: `Friday is PM-only; AM (${am}) must be 0`,
        minAm: 0,
        minPm,
      });
    }
    if (minPm > 0 && pm < minPm) {
      issues.push({
        type: 'PM_BELOW_MIN',
        severity: 'critical',
        message: `Friday PM (${pm}) below minimum (${minPm})`,
        minAm: 0,
        minPm,
      });
    }
    return issues;
  }

  if (am < minAm) {
    issues.push({
      type: 'AM_BELOW_MIN',
      severity: 'critical',
      message: `AM (${am}) below minimum (${minAm})`,
      minAm,
      minPm,
    });
  }
  if (pm < minPm) {
    issues.push({
      type: 'PM_BELOW_MIN',
      severity: 'critical',
      message: `PM (${pm}) below minimum (${minPm})`,
      minAm,
      minPm,
    });
  }
  if (pmMustExceedAm(dayOfWeek) && pm <= am) {
    issues.push({
      type: 'PM_NOT_ABOVE_AM',
      severity: 'critical',
      message: `PM (${pm}) must be greater than AM (${am})`,
      minAm,
      minPm,
    });
  }

  return issues;
}

export function isCoverageCompliant(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0,
  ruleMinPm = 0
): boolean {
  return evaluateCoverage(counts, dayOfWeek, ruleMinAm, ruleMinPm).length === 0;
}

export const COVERAGE_POLICY_SUMMARY = {
  en: 'Sat–Thu: min 2 AM, min 2 PM, PM > AM. Friday: PM-only.',
  ar: 'سبت–خميس: أقلّه 2 صباحاً و 2 مساءً، والمساء أكثر من الصباح. الجمعة: مساءً فقط.',
};
