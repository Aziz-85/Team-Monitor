import { FRIDAY_DOW } from '@/lib/schedule/policyEngine';
import { MIN_AM_SAT_THU, MIN_PM_FRIDAY, MIN_PM_SAT_THU } from './humanRules';
import type { CoverageCheckResult, ScheduleNextProposalRow } from './types';

export function checkProposalCoverage(
  rows: ScheduleNextProposalRow[],
  isRamadan: boolean
): CoverageCheckResult {
  const issues: CoverageCheckResult['issues'] = [];
  const dayCounts: CoverageCheckResult['dayCounts'] = [];

  for (const row of rows) {
    dayCounts.push({ date: row.date, amCount: row.amCount, pmCount: row.pmCount });
    const friday = row.dayOfWeek === FRIDAY_DOW;

    if (friday && !isRamadan) {
      if (row.amCount > 0) {
        issues.push({
          date: row.date,
          dayName: row.dayName,
          type: 'AM_ON_FRIDAY',
          message: `Friday AM must be 0 (got ${row.amCount})`,
          amCount: row.amCount,
          pmCount: row.pmCount,
        });
      }
      if (row.pmCount < MIN_PM_FRIDAY) {
        issues.push({
          date: row.date,
          dayName: row.dayName,
          type: 'PM_BELOW_MIN',
          message: `Friday PM (${row.pmCount}) below minimum (${MIN_PM_FRIDAY})`,
          amCount: row.amCount,
          pmCount: row.pmCount,
        });
      }
      continue;
    }

    if (row.amCount < MIN_AM_SAT_THU) {
      issues.push({
        date: row.date,
        dayName: row.dayName,
        type: 'AM_BELOW_MIN',
        message: `AM (${row.amCount}) below minimum (${MIN_AM_SAT_THU})`,
        amCount: row.amCount,
        pmCount: row.pmCount,
      });
    }
    if (row.pmCount < MIN_PM_SAT_THU) {
      issues.push({
        date: row.date,
        dayName: row.dayName,
        type: 'PM_BELOW_MIN',
        message: `PM (${row.pmCount}) below minimum (${MIN_PM_SAT_THU})`,
        amCount: row.amCount,
        pmCount: row.pmCount,
      });
    }
  }

  return { valid: issues.length === 0, issues, dayCounts };
}

export function rowStatusFromCoverage(
  row: ScheduleNextProposalRow,
  isRamadan: boolean,
  needsSupport: boolean
): ScheduleNextProposalRow['status'] {
  if (needsSupport) return 'Needs Support';
  const friday = row.dayOfWeek === FRIDAY_DOW;
  if (friday && !isRamadan) {
    if (row.pmCount < MIN_PM_FRIDAY) return 'Needs PM';
    return 'OK';
  }
  if (row.amCount < MIN_AM_SAT_THU) return 'Needs AM';
  if (row.pmCount < MIN_PM_SAT_THU) return 'Needs PM';
  if (row.amCount < MIN_AM_SAT_THU || row.pmCount < MIN_PM_SAT_THU) return 'Incomplete';
  return 'OK';
}
