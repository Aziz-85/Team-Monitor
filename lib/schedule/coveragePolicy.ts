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
  en: 'Sat–Thu: min 2 AM, min 2 PM, PM > AM. Friday: PM-only. Split used rarely.',
  ar: 'سبت–خميس: أقلّه 2 صباحاً و 2 مساءً، والمساء أكثر من الصباح. الجمعة: مساءً فقط. Split نادراً.',
};

/** Max Split assignments the auto-planner may propose per week (use sparingly). */
export const MAX_SPLIT_ASSIGNMENTS_PER_WEEK = 2;

type ShiftContribution = CoverageCounts;

/** AM/PM contribution for a working shift (NONE/OFF/LEAVE = 0). */
export function shiftCountContribution(shift: string): ShiftContribution {
  const s = shift.trim().toUpperCase();
  if (s === 'AM') return { am: 1, pm: 0 };
  if (s === 'PM') return { am: 0, pm: 1 };
  if (s === 'MORNING') return { am: 1, pm: 0 };
  if (s === 'EVENING') return { am: 0, pm: 1 };
  if (s === 'SPLIT') return { am: 1, pm: 1 };
  return { am: 0, pm: 0 };
}

export function countsAfterShiftChange(
  counts: CoverageCounts,
  fromShift: string,
  toShift: string
): CoverageCounts {
  const from = shiftCountContribution(fromShift);
  const to = shiftCountContribution(toShift);
  return { am: counts.am - from.am + to.am, pm: counts.pm - from.pm + to.pm };
}

/** Split must never leave AM below the minimum (red line: min 2 Sat–Thu). */
export function isSplitAssignmentAllowed(
  counts: CoverageCounts,
  fromShift: string,
  dayOfWeek: number,
  ruleMinAm = 0
): boolean {
  if (isFridayDay(dayOfWeek)) return false;
  const after = countsAfterShiftChange(counts, fromShift, 'SPLIT');
  return after.am >= effectiveMinAm(dayOfWeek, ruleMinAm);
}

/**
 * Show Split in dropdown only when the day still violates policy and Split could help.
 * Never offer Split on days that already meet coverage rules.
 */
export function shouldOfferSplitOption(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0,
  ruleMinPm = 0
): boolean {
  if (isFridayDay(dayOfWeek)) return false;
  if (isCoverageCompliant(counts, dayOfWeek, ruleMinAm, ruleMinPm)) return false;
  const minAm = effectiveMinAm(dayOfWeek, ruleMinAm);
  const minPm = effectiveMinPm(dayOfWeek, ruleMinPm);
  const { am, pm } = counts;
  const amToSplitViable = am >= minAm && (pm < minPm || pm <= am);
  const pmToSplitViable = am < minAm && pm >= minPm && pm > am;
  return amToSplitViable || pmToSplitViable;
}

/** Planner: AM→Split only when AM already meets minimum and PM needs +1 without losing AM headcount. */
export function canProposeMorningToSplit(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0,
  ruleMinPm = 0
): boolean {
  if (isFridayDay(dayOfWeek)) return false;
  if (isCoverageCompliant(counts, dayOfWeek, ruleMinAm, ruleMinPm)) return false;
  const minAm = effectiveMinAm(dayOfWeek, ruleMinAm);
  if (counts.am < minAm) return false;
  const afterPm = counts.pm + 1;
  return afterPm > counts.am && afterPm >= effectiveMinPm(dayOfWeek, ruleMinPm);
}

/** Planner: PM→Split adds one AM headcount while keeping PM count (helps AM below minimum). */
export function canProposeEveningToSplit(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0
): boolean {
  if (isFridayDay(dayOfWeek)) return false;
  const minAm = effectiveMinAm(dayOfWeek, ruleMinAm);
  if (counts.am >= minAm) return false;
  const afterAm = counts.am + 1;
  return afterAm >= minAm;
}
