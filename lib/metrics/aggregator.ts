/**
 * Metrics aggregator — single source of truth for sales and target KPIs.
 * All dates in Asia/Riyadh. Use with resolveMetricsScope for RBAC-consistent scope.
 * Money: SAR_INT only (SalesEntry.amount and target tables store integer riyals).
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

export type SalesMetricsInput = {
  /** When null/undefined and userId set: employee totals across ALL boutiques. */
  boutiqueId?: string | null;
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

const SALES_SOURCES: string[] = ['LEDGER', 'IMPORT', 'MANUAL'];

export async function getSalesMetrics(input: SalesMetricsInput): Promise<SalesMetricsResult> {
  if (!input.boutiqueId && !input.userId) {
    throw new Error('getSalesMetrics requires boutiqueId or userId');
  }
  const where: {
    boutiqueId?: string;
    userId?: string;
    date: { gte: Date; lt: Date };
    source: { in: string[] };
  } = {
    date: { gte: input.from, lt: input.toExclusive },
    source: { in: SALES_SOURCES },
  };
  if (input.boutiqueId) where.boutiqueId = input.boutiqueId;
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
    byDateKey[row.dateKey] = row._sum?.amount ?? 0;
  }

  return {
    netSalesTotal: agg._sum?.amount ?? 0,
    entriesCount: typeof agg._count === 'object' && agg._count && 'id' in agg._count ? agg._count.id : 0,
    byDateKey,
  };
}

export type TargetMetricsInput = {
  boutiqueId: string;
  userId: string;
  monthKey: string;
  /** When true, employee achieved (mtdSales, todaySales, weekSales) is across ALL boutiques; target is sum of all boutiques. */
  employeeCrossBoutique?: boolean;
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

  const salesWhereBase = {
    userId: input.userId,
    month: monthKey,
    source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] as string[] },
  };
  const salesWhereBoutique = input.employeeCrossBoutique
    ? salesWhereBase
    : { ...salesWhereBase, boutiqueId: input.boutiqueId };

  const [boutiqueTarget, employeeTargetResult, salesInMonth, todayEntry, weekEntries] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { boutiqueId: input.boutiqueId, month: monthKey },
    }),
    input.employeeCrossBoutique
      ? prisma.employeeMonthlyTarget.findMany({
          where: { userId: input.userId, month: monthKey },
          select: { amount: true },
        })
      : prisma.employeeMonthlyTarget.findFirst({
          where: { boutiqueId: input.boutiqueId, month: monthKey, userId: input.userId },
          select: { amount: true, leaveDaysInMonth: true, presenceFactor: true, scheduledDaysInMonth: true },
        }),
    prisma.salesEntry.findMany({
      where: { ...salesWhereBoutique, dateKey: { lte: todayStr } },
      select: { amount: true },
    }),
    prisma.salesEntry.findFirst({
      where: { ...salesWhereBoutique, dateKey: todayStr },
      select: { amount: true },
    }),
    weekInMonth
      ? prisma.salesEntry.findMany({
          where: {
            ...salesWhereBoutique,
            date: { gte: weekInMonth.start, lt: weekInMonth.end },
          },
          select: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const monthTargetSar = input.employeeCrossBoutique
    ? (Array.isArray(employeeTargetResult) ? employeeTargetResult : []).reduce((s, r) => s + r.amount, 0)
    : (employeeTargetResult && !Array.isArray(employeeTargetResult) ? employeeTargetResult.amount : 0) ?? 0;
  const monthTarget = monthTargetSar;
  const mtdSales = salesInMonth.reduce((s, e) => s + e.amount, 0);
  const todaySales = todayInSelectedMonth ? (todayEntry?.amount ?? 0) : 0;
  const weekSales = weekEntries.reduce((s, e) => s + e.amount, 0);

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

  const firstTarget =
    !input.employeeCrossBoutique && employeeTargetResult && !Array.isArray(employeeTargetResult)
      ? employeeTargetResult
      : null;

  return {
    monthKey,
    monthTarget,
    boutiqueTarget: boutiqueTargetSar,
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
    leaveDaysInMonth: firstTarget?.leaveDaysInMonth ?? null,
    presenceFactor: firstTarget?.presenceFactor ?? null,
    scheduledDaysInMonth: firstTarget?.scheduledDaysInMonth ?? null,
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
  const currentMonthTarget = targetSar;
  const byUserId: Record<string, number> = {};
  let currentMonthActual = 0;
  for (const row of salesAgg) {
    const sumSar = row._sum.amount ?? 0;
    byUserId[row.userId] = sumSar;
    currentMonthActual += sumSar;
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
