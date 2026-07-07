import { FRIDAY_DOW } from '@/lib/schedule/policyEngine';
import type { CoverageCheckResult, ScheduleNextProposalRow } from './types';

/** Sat–Thu minimum AM/PM headcount for acceptable proposals. */
export const MIN_AM_SAT_THU = 2;
export const MIN_PM_SAT_THU = 2;
export const MIN_PM_FRIDAY = 2;

export function rowViolatesHumanRules(
  row: ScheduleNextProposalRow,
  isRamadan: boolean
): string | null {
  if (row.dayOfWeek === FRIDAY_DOW && !isRamadan) {
    if (row.amCount > 0) return 'Friday must be PM-only';
    if (row.pmCount < MIN_PM_FRIDAY) return `Friday PM below ${MIN_PM_FRIDAY}`;
    return null;
  }
  if (row.amCount < MIN_AM_SAT_THU) return `AM below ${MIN_AM_SAT_THU}`;
  if (row.pmCount < MIN_PM_SAT_THU) return `PM below ${MIN_PM_SAT_THU}`;
  return null;
}

export function proposalPassesHumanRules(
  rows: ScheduleNextProposalRow[],
  isRamadan: boolean
): boolean {
  return rows.every((row) => rowViolatesHumanRules(row, isRamadan) === null);
}

export function scoreCoverageResult(result: CoverageCheckResult): number {
  return result.valid ? 1000 - result.issues.length : 100 - result.issues.length * 10;
}
