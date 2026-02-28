/**
 * Manager dashboard data for mobile: tasks, sales, coverage.
 * Single source for GET /api/mobile/dashboard/manager.
 * All queries scoped to boutiqueId. Date in Asia/Riyadh (dateKey YYYY-MM-DD).
 * Daily target uses same source of truth as web: BoutiqueMonthlyTarget + getDailyTargetForDay (calendar-day distribution).
 */

import { prisma } from '@/lib/db';
import {
  addDays,
  getDaysInMonth,
  normalizeDateOnlyRiyadh,
  toRiyadhDateString,
  getRiyadhNow,
} from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';
import { tasksRunnableOnDate } from '@/lib/services/tasks';
import { rosterForDate } from '@/lib/services/roster';

const FRIDAY_DAY_OF_WEEK = 5;

export type ManagerDashboardResult = {
  date: string;
  tasks: { done: number; total: number };
  sales: { achieved: number; target: number; percent: number };
  coverage: { am: number; pm: number; isOk: boolean; policy: string };
};

/**
 * Fetch manager dashboard for one day. Strictly scoped to boutiqueId.
 * dateStr: YYYY-MM-DD in Riyadh (defaults to today Riyadh if not provided).
 */
export async function getManagerDashboard(
  boutiqueId: string,
  dateStr: string
): Promise<ManagerDashboardResult> {
  const dayStart = normalizeDateOnlyRiyadh(dateStr);
  const dayEnd = addDays(dayStart, 1);
  const monthKey = dateStr.slice(0, 7);
  const dayOfWeek = dayStart.getUTCDay();
  const isFriday = dayOfWeek === FRIDAY_DAY_OF_WEEK;

  const [
    tasksWithSchedules,
    completionsCount,
    salesSum,
    boutiqueTarget,
    roster,
    coverageRule,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { active: true, boutiqueId },
      select: { id: true, taskSchedules: true },
    }),
    prisma.taskCompletion.count({
      where: {
        undoneAt: null,
        completedAt: { gte: dayStart, lt: dayEnd },
        task: { boutiqueId },
      },
    }),
    prisma.salesEntry.aggregate({
      where: { boutiqueId, dateKey: dateStr },
      _sum: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findUnique({
      where: { boutiqueId_month: { boutiqueId, month: monthKey } },
      select: { amount: true },
    }),
    rosterForDate(dayStart, { boutiqueIds: [boutiqueId] }),
    prisma.coverageRule.findFirst({
      where: {
        dayOfWeek,
        enabled: true,
        OR: [{ boutiqueId }, { boutiqueId: null }],
      },
      orderBy: { boutiqueId: 'desc' },
      select: { minAM: true, minPM: true },
    }),
  ]);

  const totalTasks = tasksWithSchedules.filter((t) =>
    tasksRunnableOnDate(t as Parameters<typeof tasksRunnableOnDate>[0], dayStart)
  ).length;

  const achieved = salesSum._sum.amount ?? 0;
  const monthlyTarget = boutiqueTarget?.amount ?? 0;
  const daysInMonth = getDaysInMonth(monthKey);
  const dayOfMonth1Based = dayStart.getUTCDate();
  const dailyTarget =
    daysInMonth > 0 ? getDailyTargetForDay(monthlyTarget, daysInMonth, dayOfMonth1Based) : 0;
  const percent = dailyTarget > 0 ? Math.round((achieved / dailyTarget) * 100) : 0;

  const amCount = roster.amEmployees.length;
  const pmCount = roster.pmEmployees.length;
  const minPm = isFriday ? (coverageRule?.minPM ?? 0) : (coverageRule ? Math.max(coverageRule.minPM ?? 0, 2) : 2);
  const isOk = isFriday ? amCount === 0 && pmCount >= (coverageRule?.minPM ?? 0) : pmCount >= minPm && pmCount >= amCount;

  const policyParts: string[] = [];
  if (isFriday) {
    policyParts.push('Fri: PM-only');
  } else {
    policyParts.push(`Sat–Thu: PM ≥ AM, min PM ${minPm}`);
  }
  if (coverageRule) {
    policyParts.push(`Rule: minAM=${coverageRule.minAM ?? 0} minPM=${coverageRule.minPM ?? 0}`);
  }
  const policy = policyParts.join('; ') || 'Default coverage';

  return {
    date: dateStr,
    tasks: { done: completionsCount, total: totalTasks },
    sales: {
      achieved,
      target: dailyTarget,
      percent,
    },
    coverage: {
      am: amCount,
      pm: pmCount,
      isOk,
      policy,
    },
  };
}

/** Default date string for "today" in Asia/Riyadh. */
export function getDefaultDashboardDate(): string {
  return toRiyadhDateString(getRiyadhNow());
}
