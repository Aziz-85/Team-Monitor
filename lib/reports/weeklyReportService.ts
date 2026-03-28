/**
 * Database-driven Sat–Fri (Riyadh) weekly report: boutique + employees + daily breakdown.
 * Targets: reporting calendar allocation via getDailyTargetForDay; achievements from SalesEntry.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  addDays,
  formatDateRiyadh,
  getWeekRangeForDate,
  normalizeDateOnlyRiyadh,
  normalizeMonthKey,
} from '@/lib/time';
import { getDailyMetrics, reportingAllocationForDate } from '@/lib/reports/dailyMetricsService';

export class WeeklyReportError extends Error {
  constructor(
    public code: 'INVALID_WEEK_START' | 'NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'WeeklyReportError';
  }
}

export type WeeklyReportBoutiqueBlock = {
  target: number;
  achieved: number;
  remaining: number;
  exceeded: number;
  percent: number;
};

export type WeeklyReportEmployeeRow = {
  userId: string;
  name: string;
  target: number;
  achieved: number;
  remaining: number;
  exceeded: number;
  percent: number;
  sharePercent: number;
};

export type WeeklyReportDayRow = {
  date: string;
  target: number;
  achieved: number;
  remaining: number;
  percent: number;
};

export type WeeklyReportInsights = {
  bestPerformer: { userId: string; name: string; achieved: number } | null;
  lowestPerformer: { userId: string; name: string; achieved: number } | null;
  highestSalesDay: { date: string; achieved: number } | null;
  weakestDay: { date: string; achieved: number } | null;
};

export type WeeklyReportPayload = {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  boutiqueId: string;
  boutiqueLabel?: string;
  boutique: WeeklyReportBoutiqueBlock;
  employees: WeeklyReportEmployeeRow[];
  days: WeeklyReportDayRow[];
  insights: WeeklyReportInsights;
};

function isSaturdayDateKey(dateKey: string): boolean {
  const d = normalizeDateOnlyRiyadh(dateKey);
  const { startSat } = getWeekRangeForDate(d);
  return startSat.getTime() === d.getTime();
}

/** 1-based Sat-week index within the Gregorian year of `weekSaturdayKey` (UTC calendar aligned to date keys). */
export function riyadhSatWeekNumberInYear(weekSaturdayDateKey: string): number {
  const [y, m, d] = weekSaturdayDateKey.split('-').map(Number);
  const sat = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const jan1 = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
  const dow = jan1.getUTCDay();
  const daysToFirstSat = (6 - dow + 7) % 7;
  const firstSat = addDays(jan1, daysToFirstSat);
  if (sat.getTime() < firstSat.getTime()) return 1;
  const diffDays = Math.floor((sat.getTime() - firstSat.getTime()) / 86_400_000);
  return Math.floor(diffDays / 7) + 1;
}

function weekDateKeysFromSaturday(weekStartDateKey: string): string[] {
  const start = normalizeDateOnlyRiyadh(weekStartDateKey);
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    keys.push(formatDateRiyadh(addDays(start, i)));
  }
  return keys;
}

function perfBlock(target: number, achieved: number): WeeklyReportBoutiqueBlock {
  const t = Math.trunc(target);
  const a = Math.trunc(achieved);
  const remaining = Math.max(0, t - a);
  const exceeded = Math.max(0, a - t);
  const percent = t > 0 ? Math.round((a * 100) / t) : 0;
  return { target: t, achieved: a, remaining, exceeded, percent };
}

/**
 * @param weekStartDateKey — YYYY-MM-DD of the Saturday opening the week (Riyadh).
 */
export async function getWeeklyReport(
  boutiqueId: string,
  weekStartDateKey: string,
  db: PrismaClient = prisma
): Promise<WeeklyReportPayload> {
  const weekStart = weekStartDateKey.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !isSaturdayDateKey(weekStart)) {
    throw new WeeklyReportError('INVALID_WEEK_START', 'weekStart must be YYYY-MM-DD (Saturday, Riyadh calendar)');
  }

  const weekDateKeys = weekDateKeysFromSaturday(weekStart);
  const weekEnd = weekDateKeys[6]!;
  const monthKeys = Array.from(new Set(weekDateKeys.map((k) => normalizeMonthKey(k.slice(0, 7)))));

  const [boutiqueTargets, employeeTargets, users, boutiqueWeekAgg, weekByUser, dailyMetricsList] =
    await Promise.all([
      db.boutiqueMonthlyTarget.findMany({
        where: { boutiqueId, month: { in: monthKeys } },
        select: { month: true, amount: true },
      }),
      db.employeeMonthlyTarget.findMany({
        where: { boutiqueId, month: { in: monthKeys } },
        select: { userId: true, month: true, amount: true },
      }),
      db.user.findMany({
        where: {
          employee: { boutiqueId, active: true, isSystemOnly: false },
        },
        select: {
          id: true,
          employee: { select: { name: true, empId: true } },
        },
      }),
      db.salesEntry.aggregate({
        where: {
          boutiqueId,
          dateKey: { gte: weekStart, lte: weekEnd },
        },
        _sum: { amount: true },
      }),
      db.salesEntry.groupBy({
        by: ['userId'],
        where: {
          boutiqueId,
          dateKey: { gte: weekStart, lte: weekEnd },
        },
        _sum: { amount: true },
      }),
      Promise.all(weekDateKeys.map((dk) => getDailyMetrics(boutiqueId, dk, db))),
    ]);

  const boutiqueMonthTarget = new Map(boutiqueTargets.map((r) => [normalizeMonthKey(r.month), r.amount]));
  const empMonthTarget = new Map(
    employeeTargets.map((r) => [`${r.userId}:${normalizeMonthKey(r.month)}`, r.amount])
  );

  let weeklyTargetBoutique = 0;
  for (const dk of weekDateKeys) {
    const mk = normalizeMonthKey(dk.slice(0, 7));
    const mt = Math.trunc(boutiqueMonthTarget.get(mk) ?? 0);
    weeklyTargetBoutique += reportingAllocationForDate(mt, dk);
  }

  const weeklyAchievedBoutique = Math.trunc(boutiqueWeekAgg._sum.amount ?? 0);
  const boutique = perfBlock(weeklyTargetBoutique, weeklyAchievedBoutique);

  const weekAchievedByUser = new Map(weekByUser.map((r) => [r.userId, Math.trunc(r._sum.amount ?? 0)]));

  const employees: WeeklyReportEmployeeRow[] = users.map((u) => {
    let empWeeklyTarget = 0;
    for (const dk of weekDateKeys) {
      const mk = normalizeMonthKey(dk.slice(0, 7));
      const mt = Math.trunc(empMonthTarget.get(`${u.id}:${mk}`) ?? 0);
      empWeeklyTarget += reportingAllocationForDate(mt, dk);
    }
    const achieved = weekAchievedByUser.get(u.id) ?? 0;
    const block = perfBlock(empWeeklyTarget, achieved);
    const sharePercent =
      weeklyAchievedBoutique > 0 ? Math.round((achieved * 100) / weeklyAchievedBoutique) : 0;
    return {
      userId: u.id,
      name: u.employee?.name ?? u.employee?.empId ?? u.id,
      target: block.target,
      achieved: block.achieved,
      remaining: block.remaining,
      exceeded: block.exceeded,
      percent: block.percent,
      sharePercent,
    };
  });

  employees.sort((a, b) => b.achieved - a.achieved);

  const days: WeeklyReportDayRow[] = dailyMetricsList.map((m) => ({
    date: m.dateKey,
    target: m.dailyTargetSar,
    achieved: m.dailyAchievedSar,
    remaining: m.dailyRemainingSar,
    percent: m.dailyAchievementPercent,
  }));

  const insights = buildInsights(employees, days);

  return {
    weekNumber: riyadhSatWeekNumberInYear(weekStart),
    weekStart,
    weekEnd,
    boutiqueId,
    boutique,
    employees,
    days,
    insights,
  };
}

function buildInsights(
  employees: WeeklyReportEmployeeRow[],
  days: WeeklyReportDayRow[]
): WeeklyReportInsights {
  if (employees.length === 0) {
    return {
      bestPerformer: null,
      lowestPerformer: null,
      highestSalesDay: null,
      weakestDay: null,
    };
  }
  const byAch = [...employees].sort((a, b) => b.achieved - a.achieved);
  const bestPerformer = byAch[0]!
    ? { userId: byAch[0]!.userId, name: byAch[0]!.name, achieved: byAch[0]!.achieved }
    : null;
  const lowestPerformer = [...employees].sort((a, b) => a.achieved - b.achieved)[0]!;
  const lowest = {
    userId: lowestPerformer.userId,
    name: lowestPerformer.name,
    achieved: lowestPerformer.achieved,
  };

  let highestSalesDay: WeeklyReportInsights['highestSalesDay'] = null;
  let weakestDay: WeeklyReportInsights['weakestDay'] = null;
  if (days.length > 0) {
    const maxDay = [...days].sort((a, b) => b.achieved - a.achieved)[0]!;
    const minDay = [...days].sort((a, b) => a.achieved - b.achieved)[0]!;
    highestSalesDay = { date: maxDay.date, achieved: maxDay.achieved };
    weakestDay = { date: minDay.date, achieved: minDay.achieved };
  }

  return {
    bestPerformer,
    lowestPerformer: lowest,
    highestSalesDay,
    weakestDay,
  };
}
