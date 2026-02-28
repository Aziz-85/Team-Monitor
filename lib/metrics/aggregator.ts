/**
 * Metrics aggregator — single source of truth for sales and target KPIs.
 * All dates in Asia/Riyadh. Use with resolveMetricsScope for RBAC-consistent scope.
 * Money: SalesEntry.amount is stored as SAR (from ledger sync: amountSar). We convert to halalas at read.
 * Target tables store SAR (int); we convert to halalas at read.
 */

import { prisma } from '@/lib/db';
import {
  getRiyadhNow,
  toRiyadhDateString,
  formatMonthKey,
  getMonthRange,
  getDaysInMonth,
  getWeekRangeForDate,
  intersectRanges,
  normalizeMonthKey,
} from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';

/** Target tables store SAR (integer). SalesEntry.amount is SAR (from sync). Convert to halalas at read. */
const SAR_TO_HALALAS = 100;

function salesEntrySarToHalalas(sar: number): number {
  return Math.round(Number(sar) * SAR_TO_HALALAS);
}

export type SalesMetricsInput = {
  boutiqueId: string;
  userId?: string | null;
  from: Date;
  toExclusive: Date;
  monthKey?: string;
};

export type SalesMetricsResult = {
  netSalesTotal: number;
  entriesCount: number;
  byDateKey: Record<string, number>;
};

export async function getSalesMetrics(input: SalesMetricsInput): Promise<SalesMetricsResult> {
  const where: {
    boutiqueId: string;
    userId?: string;
    date: { gte: Date; lt: Date };
    source: { in: string[] };
  } = {
    boutiqueId: input.boutiqueId,
    date: { gte: input.from, lt: input.toExclusive },
    source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
  };
  if (input.userId) where.userId = input.userId;

  const [agg, byDate] = await Promise.all([
    prisma.salesEntry.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where,
      _sum: { amount: true },
    }),
  ]);

  const byDateKey: Record<string, number> = {};
  for (const row of byDate) {
    byDateKey[row.dateKey] = salesEntrySarToHalalas(row._sum.amount ?? 0);
  }

  const netSalesTotal = salesEntrySarToHalalas(agg._sum.amount ?? 0);
  return {
    netSalesTotal,
    entriesCount: agg._count.id,
    byDateKey,
  };
}

export type TargetMetricsInput = {
  boutiqueId: string;
  userId: string;
  monthKey: string;
};

export type TargetMetricsResult = {
  monthKey: string;
  monthTarget: number;
  boutiqueTarget: number | null;
  mtdSales: number;
  todaySales: number;
  weekSales: number;
  dailyTarget: number;
  weekTarget: number;
  remaining: number;
  pctDaily: number;
  pctWeek: number;
  pctMonth: number;
  todayStr: string;
  todayInSelectedMonth: boolean;
  weekRangeLabel: string;
  daysInMonth: number;
  leaveDaysInMonth: number | null;
  presenceFactor: number | null;
  scheduledDaysInMonth: number | null;
};

export async function getTargetMetrics(input: TargetMetricsInput): Promise<TargetMetricsResult> {
  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const monthKey = normalizeMonthKey(input.monthKey);
  const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);
  const daysInMonth = getDaysInMonth(monthKey);
  const todayDateOnly = new Date(todayStr + 'T00:00:00.000Z');
  const todayInSelectedMonth = formatMonthKey(todayDateOnly) === monthKey;
  const anchorDate = todayInSelectedMonth ? todayDateOnly : monthStart;
  const { startSat, endExclusiveFriPlus1 } = getWeekRangeForDate(anchorDate);
  const weekInMonth = intersectRanges(startSat, endExclusiveFriPlus1, monthStart, monthEnd);

  const fridayDate = weekInMonth ? new Date(endExclusiveFriPlus1.getTime() - 86400000) : null;
  const weekRangeLabel =
    weekInMonth && fridayDate
      ? `${toRiyadhDateString(startSat)} – ${toRiyadhDateString(fridayDate)}`
      : '';

  const [boutiqueTarget, employeeTarget, salesInMonth, todayEntry, weekEntries] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { boutiqueId: input.boutiqueId, month: monthKey },
    }),
    prisma.employeeMonthlyTarget.findFirst({
      where: { boutiqueId: input.boutiqueId, month: monthKey, userId: input.userId },
    }),
    prisma.salesEntry.findMany({
      where: { boutiqueId: input.boutiqueId, userId: input.userId, month: monthKey },
      select: { amount: true },
    }),
    prisma.salesEntry.findFirst({
      where: { boutiqueId: input.boutiqueId, userId: input.userId, dateKey: todayStr },
    }),
    weekInMonth
      ? prisma.salesEntry.findMany({
          where: {
            boutiqueId: input.boutiqueId,
            userId: input.userId,
            date: { gte: weekInMonth.start, lt: weekInMonth.end },
          },
          select: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const monthTargetSar = employeeTarget?.amount ?? 0;
  const monthTarget = Math.round(monthTargetSar * SAR_TO_HALALAS);
  const mtdSales = salesEntrySarToHalalas(salesInMonth.reduce((s, e) => s + e.amount, 0));
  const todaySales = salesEntrySarToHalalas(todayInSelectedMonth ? (todayEntry?.amount ?? 0) : 0);
  const weekSales = salesEntrySarToHalalas(weekEntries.reduce((s, e) => s + e.amount, 0));

  const todayDayOfMonth = todayDateOnly.getUTCDate();
  const dailyTarget = daysInMonth > 0 ? getDailyTargetForDay(monthTarget, daysInMonth, todayDayOfMonth) : 0;

  let weekTarget = 0;
  if (weekInMonth && daysInMonth > 0) {
    const start = weekInMonth.start.getTime();
    const end = weekInMonth.end.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    for (let t = start; t < end; t += dayMs) {
      const d = new Date(t);
      weekTarget += getDailyTargetForDay(monthTarget, daysInMonth, d.getUTCDate());
    }
  }

  const remaining = Math.max(0, monthTarget - mtdSales);
  const pctDaily = dailyTarget > 0 ? (todaySales / dailyTarget) * 100 : 0;
  const pctWeek = weekTarget > 0 ? (weekSales / weekTarget) * 100 : 0;
  const pctMonth = monthTarget > 0 ? (mtdSales / monthTarget) * 100 : 0;

  const boutiqueTargetSar = boutiqueTarget?.amount ?? null;
  const boutiqueTargetHalalas = boutiqueTargetSar != null ? Math.round(boutiqueTargetSar * SAR_TO_HALALAS) : null;

  return {
    monthKey,
    monthTarget,
    boutiqueTarget: boutiqueTargetHalalas,
    mtdSales,
    todaySales,
    weekSales,
    dailyTarget,
    weekTarget,
    remaining,
    pctDaily,
    pctWeek,
    pctMonth,
    todayStr,
    todayInSelectedMonth,
    weekRangeLabel,
    daysInMonth,
    leaveDaysInMonth: employeeTarget?.leaveDaysInMonth ?? null,
    presenceFactor: employeeTarget?.presenceFactor ?? null,
    scheduledDaysInMonth: employeeTarget?.scheduledDaysInMonth ?? null,
  };
}

export type DashboardSalesMetricsInput = {
  boutiqueId: string;
  userId?: string | null;
  monthKey: string;
  employeeOnly: boolean;
};

export type DashboardSalesMetricsResult = {
  currentMonthTarget: number;
  currentMonthActual: number;
  completionPct: number;
  remainingGap: number;
  byUserId: Record<string, number>;
};

export async function getDashboardSalesMetrics(
  input: DashboardSalesMetricsInput
): Promise<DashboardSalesMetricsResult> {
  const monthKey = normalizeMonthKey(input.monthKey);
  const where: {
    boutiqueId: string;
    month: string;
    userId?: string;
    source: { in: string[] };
  } = {
    boutiqueId: input.boutiqueId,
    month: monthKey,
    source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
  };
  if (input.employeeOnly && input.userId) where.userId = input.userId;

  const [boutiqueTarget, salesAgg] = await Promise.all([
    input.employeeOnly && input.userId
      ? prisma.employeeMonthlyTarget.findFirst({
          where: { boutiqueId: input.boutiqueId, month: monthKey, userId: input.userId },
        })
      : prisma.boutiqueMonthlyTarget.findFirst({
          where: { boutiqueId: input.boutiqueId, month: monthKey },
        }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where,
      _sum: { amount: true },
    }),
  ]);

  const targetSar = boutiqueTarget?.amount ?? 0;
  const currentMonthTarget = Math.round(targetSar * SAR_TO_HALALAS);
  const byUserId: Record<string, number> = {};
  let currentMonthActual = 0;
  for (const row of salesAgg) {
    const sumHalalas = salesEntrySarToHalalas(row._sum.amount ?? 0);
    byUserId[row.userId] = sumHalalas;
    currentMonthActual += sumHalalas;
  }

  const completionPct = currentMonthTarget > 0 ? Math.round((currentMonthActual / currentMonthTarget) * 100) : 0;
  const remainingGap = Math.max(0, currentMonthTarget - currentMonthActual);

  return {
    currentMonthTarget,
    currentMonthActual,
    completionPct,
    remainingGap,
    byUserId,
  };
}
