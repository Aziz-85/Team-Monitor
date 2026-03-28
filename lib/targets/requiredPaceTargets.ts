/**
 * Required pace targets (operational) — SAR integers only.
 * Distinct from reporting allocation via `getDailyTargetForDay` (calendar distribution of month target).
 *
 * Operational daily required:
 *   remainingMonth = max(monthTarget - achievedMTD, 0)
 *   dailyRequired = ceil(remainingMonth / max(daysRemainingIncludingToday, 1))
 *
 * Operational weekly required:
 *   Sum of sequential daily-required values for each remaining Riyadh-calendar day in the
 *   current week (Sat→Fri window intersected with month), assuming each day's required amount
 *   is met before moving to the next (same remaining-month curve).
 */

import { getDaysRemainingInMonthIncluding, normalizeMonthKey } from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';

export function remainingMonthTargetSar(monthTarget: number, mtdAchieved: number): number {
  return Math.max(0, Math.trunc(monthTarget) - Math.trunc(mtdAchieved));
}

export function dailyRequiredTargetSar(
  remainingMonthTarget: number,
  daysRemainingIncludingToday: number
): number {
  const rem = Math.trunc(remainingMonthTarget);
  if (rem <= 0) return 0;
  const n = Math.max(1, Math.trunc(daysRemainingIncludingToday));
  return Math.ceil(rem / n);
}

function dateKeyStepNext(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Riyadh week segment [fromDateKey, weekEndExclusive) intersected with monthKey.
 */
export function dateKeysForPaceWeekFrom(
  monthKey: string,
  fromDateKey: string,
  weekEndExclusive: Date
): string[] {
  const mk = normalizeMonthKey(monthKey);
  const endMs = weekEndExclusive.getTime();
  const out: string[] = [];
  let cur = fromDateKey;
  for (let i = 0; i < 40; i++) {
    const t = new Date(cur + 'T12:00:00.000Z').getTime();
    if (t >= endMs) break;
    if (cur.slice(0, 7) === mk) out.push(cur);
    cur = dateKeyStepNext(cur);
  }
  return out;
}

export function weeklyRequiredTargetSarSum(input: {
  monthKey: string;
  fromDateKey: string;
  weekEndExclusive: Date;
  remainingMonthSarAtStart: number;
}): number {
  const keys = dateKeysForPaceWeekFrom(input.monthKey, input.fromDateKey, input.weekEndExclusive);
  let rem = Math.max(0, Math.trunc(input.remainingMonthSarAtStart));
  let sum = 0;
  for (const dk of keys) {
    const n = getDaysRemainingInMonthIncluding(input.monthKey, dk);
    if (n <= 0 || rem <= 0) break;
    const d = Math.ceil(rem / Math.max(1, n));
    sum += d;
    rem = Math.max(0, rem - d);
  }
  return sum;
}

export type ReportingAndPaceSnapshot = {
  reportingDailyAllocationSar: number;
  reportingWeeklyAllocationSar: number;
  paceDailyRequiredSar: number;
  paceWeeklyRequiredSar: number;
  remainingMonthTargetSar: number;
};

/**
 * Reporting = calendar allocation of month target; pace = remaining / remaining days (operational).
 * When not viewing the live month (today not in selected month), pace targets are 0.
 */
export function computeReportingAndPaceSnapshot(input: {
  monthTarget: number;
  mtdAchieved: number;
  daysInMonth: number;
  monthKey: string;
  todayDateKey: string;
  todayDayOfMonth: number;
  todayInSelectedMonth: boolean;
  weekInMonth: { start: Date; end: Date } | null;
}): ReportingAndPaceSnapshot {
  const monthTarget = Math.trunc(input.monthTarget);
  const mtd = Math.trunc(input.mtdAchieved);
  const dim = Math.trunc(input.daysInMonth);
  const remMonth = remainingMonthTargetSar(monthTarget, mtd);

  const reportingDailyAllocationSar =
    dim > 0 ? getDailyTargetForDay(monthTarget, dim, input.todayDayOfMonth) : 0;

  let reportingWeeklyAllocationSar = 0;
  if (input.weekInMonth && dim > 0) {
    const dayMs = 24 * 60 * 60 * 1000;
    for (let t = input.weekInMonth.start.getTime(); t < input.weekInMonth.end.getTime(); t += dayMs) {
      reportingWeeklyAllocationSar += getDailyTargetForDay(
        monthTarget,
        dim,
        new Date(t).getUTCDate()
      );
    }
  }

  let paceDailyRequiredSar = 0;
  let paceWeeklyRequiredSar = 0;
  if (input.todayInSelectedMonth) {
    const daysRem = getDaysRemainingInMonthIncluding(input.monthKey, input.todayDateKey);
    paceDailyRequiredSar = dailyRequiredTargetSar(remMonth, daysRem);
    if (input.weekInMonth && daysRem > 0) {
      paceWeeklyRequiredSar = weeklyRequiredTargetSarSum({
        monthKey: input.monthKey,
        fromDateKey: input.todayDateKey,
        weekEndExclusive: input.weekInMonth.end,
        remainingMonthSarAtStart: remMonth,
      });
    }
  }

  return {
    reportingDailyAllocationSar,
    reportingWeeklyAllocationSar,
    paceDailyRequiredSar,
    paceWeeklyRequiredSar,
    remainingMonthTargetSar: remMonth,
  };
}
