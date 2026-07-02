/**
 * Management-friendly schedule quality percentages (pre- and post-solve).
 */

import type { ConstraintAnalysisResult } from '@/lib/schedule/constraintAnalyzer';
import type { ScheduleQualityMetrics } from '@/lib/schedule/scheduleUiMetrics';

export type ScheduleQualityPercents = {
  scheduleQualityPercent: number;
  coverageHealthPercent: number;
  staffAvailabilityPercent: number;
  constraintHealthPercent: number;
  fairnessHealthPercent: number;
};

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Pre-solve percentages from constraint analysis. */
export function qualityPercentsFromAnalysis(
  analysis: ConstraintAnalysisResult
): ScheduleQualityPercents {
  const { summary, status, issues } = analysis;
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  const missingSlots = Math.max(0, summary.requiredCoverageSlots - summary.availableCoverageSlots);
  const slotGapRatio =
    summary.requiredCoverageSlots > 0 ? missingSlots / summary.requiredCoverageSlots : 0;

  const staffAvailabilityPercent = clampPercent(
    summary.requiredStaffHours > 0
      ? (summary.availableStaffHours / summary.requiredStaffHours) * 100
      : 100
  );

  const coverageHealthPercent = clampPercent(100 - slotGapRatio * 100);

  const constraintHealthPercent = clampPercent(
    100 - criticalCount * 25 - warningCount * 8
  );

  let scheduleQualityPercent = 100;
  if (status === 'NEEDS_SUPPORT') {
    scheduleQualityPercent = clampPercent(75 - summary.missingStaffHours * 2);
  } else if (status === 'IMPOSSIBLE') {
    scheduleQualityPercent = clampPercent(
      40 - criticalCount * 8 - Math.round(slotGapRatio * 30)
    );
  } else {
    scheduleQualityPercent = clampPercent(100 - slotGapRatio * 20);
  }

  const fairnessHealthPercent = clampPercent(
    status === 'FEASIBLE' ? 85 + (100 - staffAvailabilityPercent) * 0.1 : scheduleQualityPercent * 0.9
  );

  return {
    scheduleQualityPercent,
    coverageHealthPercent,
    staffAvailabilityPercent,
    constraintHealthPercent,
    fairnessHealthPercent,
  };
}

/** Post-solve percentages from engine metrics. */
export function qualityPercentsFromSolve(
  metrics: ScheduleQualityMetrics,
  rawFairnessScore: number | null | undefined
): ScheduleQualityPercents {
  const coverageHealthPercent = metrics.coverageValid
    ? 100
    : clampPercent(100 - metrics.slotViolationCount * 2);

  const staffAvailabilityPercent = metrics.coverageValid ? 98 : clampPercent(85 - metrics.slotViolationCount);

  const constraintHealthPercent = clampPercent(
    100 - metrics.slotViolationCount * 3 - metrics.overtimeCount * 5
  );

  const fairnessHealthPercent = fairnessHealthFromRawScore(
    rawFairnessScore ?? 0,
    metrics.coverageValid
  );

  const scheduleQualityPercent = clampPercent(
    (coverageHealthPercent * 0.4 +
      staffAvailabilityPercent * 0.25 +
      constraintHealthPercent * 0.2 +
      fairnessHealthPercent * 0.15)
  );

  return {
    scheduleQualityPercent,
    coverageHealthPercent,
    staffAvailabilityPercent,
    constraintHealthPercent,
    fairnessHealthPercent,
  };
}

/** Map internal fairness score to 0–100 health (raw score stays in Technical Details). */
export function fairnessHealthFromRawScore(rawScore: number, coverageValid: boolean): number {
  if (!coverageValid) {
    return clampPercent(Math.max(5, 100 - rawScore / 1500));
  }
  if (rawScore <= 50) return 98;
  if (rawScore <= 150) return clampPercent(95 - rawScore / 10);
  if (rawScore <= 400) return clampPercent(80 - (rawScore - 150) / 20);
  return clampPercent(Math.max(20, 70 - (rawScore - 400) / 50));
}
