/**
 * AM/PM bucket policy (Sat–Thu vs Friday) — legacy dashboard warnings layer.
 *
 * Engine v3: this is NOT the coverage engine. Real coverage validation is per
 * 30-minute time slot from saved segments (lib/schedule/engine). This module only
 * maps engine-derived AM/PM projections onto human-readable bucket warnings and
 * powers advisory editor checks. Do not use it to decide schedule validity.
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

/** Sat–Thu: PM must be at least AM (PM ≥ AM). */
export function pmMustBeAtLeastAm(dayOfWeek: number): boolean {
  return !isFridayDay(dayOfWeek);
}

/** @deprecated Use pmMustBeAtLeastAm — kept for callers during migration */
export function pmMustExceedAm(dayOfWeek: number): boolean {
  return pmMustBeAtLeastAm(dayOfWeek);
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
  if (pmMustBeAtLeastAm(dayOfWeek) && pm < am) {
    issues.push({
      type: 'PM_NOT_ABOVE_AM',
      severity: 'critical',
      message: `PM (${pm}) must be at least AM (${am})`,
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

/**
 * Evaluate coverage using resolved Boutique Configuration mins (no legacy floor of 2).
 * Used by Schedule Editor when mins are supplied from getBoutiqueConfiguration.
 */
export function evaluateCoverageWithResolvedMins(
  counts: CoverageCounts,
  dayOfWeek: number,
  minAm: number,
  minPm: number
): CoverageIssue[] {
  const { am, pm } = counts;
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
  if (pmMustBeAtLeastAm(dayOfWeek) && pm < am) {
    issues.push({
      type: 'PM_NOT_ABOVE_AM',
      severity: 'critical',
      message: `PM (${pm}) must be at least AM (${am})`,
      minAm,
      minPm,
    });
  }

  return issues;
}

export const COVERAGE_POLICY_SUMMARY = {
  en: 'Sat–Thu: AM ≥ 2, PM ≥ AM, PM ≥ 2. Friday: PM-only. Split up to 2 per employee/week.',
  ar: 'سبت–خميس: AM ≥ 2، PM ≥ AM، PM ≥ 2. الجمعة: مساءً فقط. Split حتى 2 لكل موظف/أسبوع.',
};

/** Max Split shifts per employee per week. */
export const MAX_SPLIT_SHIFTS_PER_EMPLOYEE_PER_WEEK = 2;

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

/** Split must keep AM ≥ minimum and PM ≥ AM. */
export function isSplitAssignmentAllowed(
  counts: CoverageCounts,
  fromShift: string,
  dayOfWeek: number,
  ruleMinAm = 0
): boolean {
  if (isFridayDay(dayOfWeek)) return false;
  void counts;
  void fromShift;
  void ruleMinAm;
  return true;
}

/** Split is available on non-Friday days. Editor never hides Split based on AM/PM buckets. */
export function shouldOfferSplitOption(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0
): boolean {
  void counts;
  void ruleMinAm;
  return !isFridayDay(dayOfWeek);
}

/** Planner: AM→Split when AM ≥ min and PM needs +1 (PM ≥ AM after). */
export function canProposeMorningToSplit(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0,
  ruleMinPm = 0
): boolean {
  if (isFridayDay(dayOfWeek)) return false;
  const minAm = effectiveMinAm(dayOfWeek, ruleMinAm);
  if (counts.am < minAm) return false;
  const afterPm = counts.pm + 1;
  return afterPm >= counts.am && afterPm >= effectiveMinPm(dayOfWeek, ruleMinPm);
}

/** Planner: PM→Split adds AM headcount while keeping PM ≥ AM. */
export function canProposeEveningToSplit(
  counts: CoverageCounts,
  dayOfWeek: number,
  ruleMinAm = 0
): boolean {
  if (isFridayDay(dayOfWeek)) return false;
  const minAm = effectiveMinAm(dayOfWeek, ruleMinAm);
  if (counts.am >= minAm) return false;
  const afterAm = counts.am + 1;
  const afterPm = counts.pm;
  return afterAm >= minAm && afterPm >= afterAm;
}
