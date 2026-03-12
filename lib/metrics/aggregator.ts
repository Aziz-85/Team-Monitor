/**
 * Metrics aggregator — single source of truth for sales and target KPIs.
 * All dates in Asia/Riyadh. Use with resolveMetricsScope for RBAC-consistent scope.
 * Money: SAR_INT only (SalesEntry.amount and target tables store integer riyals).
 *
 * Canonical flow:
 * - Manager/boutique performance: getPerformanceSummaryExtended → /api/performance/summary, /api/dashboard
 * - Employee targets: getTargetMetrics → /api/metrics/my-target, /api/me/targets
 * - Sales-only snapshot: getDashboardSalesMetrics → /api/metrics/dashboard
 * All percent calculations use lib/performance/performanceEngine.calculatePerformance.
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
import { calculatePerformance } from '@/lib/performance/performanceEngine';

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

  const remaining = monthTarget - mtdSales;
  const dailyPerf = calculatePerformance({ target: dailyTarget, sales: todaySales });
  const weekPerf = calculatePerformance({ target: weekTarget, sales: weekSales });
  const monthPerf = calculatePerformance({ target: monthTarget, sales: mtdSales });
  const pctDaily = dailyPerf.percent;
  const pctWeek = weekPerf.percent;
  const pctMonth = monthPerf.percent;

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

  const perf = calculatePerformance({ target: currentMonthTarget, sales: currentMonthActual });
  const completionPct = perf.percent;
  const remainingGap = perf.remaining;

  return {
    currentMonthTarget,
    currentMonthActual,
    completionPct,
    remainingGap,
    byUserId,
  };
}

export type PerformanceSummaryInput = {
  boutiqueId: string;
  userId?: string | null;
  monthKey: string;
  employeeOnly: boolean;
  /** When true (employee view), target = sum of all boutiques; sales = across all boutiques. */
  employeeCrossBoutique?: boolean;
};

export type PerformancePeriod = {
  target: number;
  sales: number;
  remaining: number;
  percent: number;
};

export type PerformanceSummaryResult = {
  daily: PerformancePeriod;
  weekly: PerformancePeriod;
  monthly: PerformancePeriod;
};

export type DailyTrajectoryPoint = {
  dateKey: string;
  targetCumulative: number;
  actualCumulative: number;
};

export type TopSeller = { name: string; amount: number } | null;

export type PerformanceSummaryExtendedResult = PerformanceSummaryResult & {
  dailyTrajectory: DailyTrajectoryPoint[];
  topSellers: { today: TopSeller; week: TopSeller; month: TopSeller };
  /** Per-user MTD sales when !employeeOnly. Used by Dashboard sales breakdown. */
  byUserId: Record<string, number>;
  daysInMonth: number;
  todayDayOfMonth: number;
};

/**
 * Unified performance summary for /api/performance/summary.
 * Returns daily, weekly, monthly targets, sales, remaining, percent.
 * Uses calculatePerformance for all metrics. SAR_INT only.
 */
export async function getPerformanceSummary(
  input: PerformanceSummaryInput
): Promise<PerformanceSummaryResult> {
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

  const where: {
    boutiqueId?: string;
    month: string;
    userId?: string;
    source: { in: string[] };
  } = {
    month: monthKey,
    source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
  };
  if (input.employeeCrossBoutique && input.userId) {
    where.userId = input.userId;
  } else {
    where.boutiqueId = input.boutiqueId;
    if (input.employeeOnly && input.userId) where.userId = input.userId;
  }

  const [targetRow, targetRowsAll, mtdAgg, todayAgg, weekAgg] = await Promise.all([
    input.employeeOnly && input.userId && !input.employeeCrossBoutique
      ? prisma.employeeMonthlyTarget.findFirst({
          where: { boutiqueId: input.boutiqueId, month: monthKey, userId: input.userId },
        })
      : !input.employeeOnly
        ? prisma.boutiqueMonthlyTarget.findFirst({
            where: { boutiqueId: input.boutiqueId, month: monthKey },
          })
        : null,
    input.employeeCrossBoutique && input.userId
      ? prisma.employeeMonthlyTarget.findMany({
          where: { userId: input.userId, month: monthKey },
          select: { amount: true },
        })
      : null,
    prisma.salesEntry.aggregate({
      where: { ...where, dateKey: { lte: todayStr } },
      _sum: { amount: true },
    }),
    todayInSelectedMonth
      ? prisma.salesEntry.aggregate({
          where: { ...where, dateKey: todayStr },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
    weekInMonth
      ? prisma.salesEntry.aggregate({
          where: {
            ...where,
            date: { gte: weekInMonth.start, lt: weekInMonth.end },
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
  ]);

  const monthTarget =
    input.employeeCrossBoutique && targetRowsAll
      ? targetRowsAll.reduce((s, r) => s + r.amount, 0)
      : (targetRow?.amount ?? 0);
  const mtdSales = mtdAgg._sum?.amount ?? 0;
  const todaySales = todayInSelectedMonth ? (todayAgg._sum?.amount ?? 0) : 0;
  const weekSales = weekInMonth ? (weekAgg._sum?.amount ?? 0) : 0;

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

  const daily = calculatePerformance({ target: dailyTarget, sales: todaySales });
  const weekly = calculatePerformance({ target: weekTarget, sales: weekSales });
  const monthly = calculatePerformance({ target: monthTarget, sales: mtdSales });

  return {
    daily: { target: daily.target, sales: daily.sales, remaining: daily.remaining, percent: daily.percent },
    weekly: { target: weekly.target, sales: weekly.sales, remaining: weekly.remaining, percent: weekly.percent },
    monthly: { target: monthly.target, sales: monthly.sales, remaining: monthly.remaining, percent: monthly.percent },
  };
}

/**
 * Extended performance summary for dashboard: adds dailyTrajectory and topSellers.
 * Only fetches topSellers when boutique view (not employeeOnly).
 */
export async function getPerformanceSummaryExtended(
  input: PerformanceSummaryInput
): Promise<PerformanceSummaryExtendedResult> {
  const base = await getPerformanceSummary(input);
  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const monthKey = normalizeMonthKey(input.monthKey);
  const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);
  const daysInMonth = getDaysInMonth(monthKey);
  const todayDateOnly = new Date(todayStr + 'T00:00:00.000Z');
  const todayInSelectedMonth = formatMonthKey(todayDateOnly) === monthKey;
  const todayDayOfMonth = todayDateOnly.getUTCDate();
  const anchorDate = todayInSelectedMonth ? todayDateOnly : monthStart;
  const { startSat, endExclusiveFriPlus1 } = getWeekRangeForDate(anchorDate);
  const weekInMonth = intersectRanges(startSat, endExclusiveFriPlus1, monthStart, monthEnd);

  const where: {
    boutiqueId?: string;
    month: string;
    userId?: string;
    source: { in: string[] };
  } = {
    month: monthKey,
    source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
  };
  if (input.employeeCrossBoutique && input.userId) {
    where.userId = input.userId;
  } else {
    where.boutiqueId = input.boutiqueId;
    if (input.employeeOnly && input.userId) where.userId = input.userId;
  }

  const [salesByDate, todayByUser, weekByUser, monthByUser] = await Promise.all([
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: { ...where, dateKey: { lte: todayStr } },
      _sum: { amount: true },
    }),
    todayInSelectedMonth && !input.employeeOnly
      ? prisma.salesEntry.groupBy({
          by: ['userId'],
          where: { ...where, dateKey: todayStr },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    weekInMonth && !input.employeeOnly
      ? prisma.salesEntry.groupBy({
          by: ['userId'],
          where: { ...where, date: { gte: weekInMonth.start, lt: weekInMonth.end } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    !input.employeeOnly
      ? prisma.salesEntry.groupBy({
          by: ['userId'],
          where: { ...where, dateKey: { lte: todayStr } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const salesByDateKey = new Map(salesByDate.map((r) => [r.dateKey, r._sum?.amount ?? 0]));

  const monthTarget = base.monthly.target;
  let cumTarget = 0;
  let cumActual = 0;
  const dailyTrajectory: DailyTrajectoryPoint[] = [];
  const [y, m] = monthKey.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  for (let d = 1; d <= (todayInSelectedMonth ? todayDayOfMonth : 0); d++) {
    const dateKey = `${y}-${mm}-${String(d).padStart(2, '0')}`;
    cumTarget += getDailyTargetForDay(monthTarget, daysInMonth, d);
    cumActual += salesByDateKey.get(dateKey) ?? 0;
    dailyTrajectory.push({ dateKey, targetCumulative: cumTarget, actualCumulative: cumActual });
  }

  const pickTop = async (
    rows: { userId: string; _sum: { amount: number | null } }[]
  ): Promise<TopSeller> => {
    if (rows.length === 0) return null;
    const top = rows.reduce((a, b) =>
      (a._sum?.amount ?? 0) >= (b._sum?.amount ?? 0) ? a : b
    );
    const amount = top._sum?.amount ?? 0;
    if (amount <= 0) return null;
    const u = await prisma.user.findUnique({
      where: { id: top.userId },
      select: { employee: { select: { name: true } }, empId: true },
    });
    const name = u?.employee?.name ?? u?.empId ?? top.userId;
    return { name, amount };
  };

  const [topToday, topWeek, topMonth] = await Promise.all([
    pickTop(todayByUser),
    pickTop(weekByUser),
    pickTop(monthByUser),
  ]);

  const byUserId: Record<string, number> = input.employeeOnly
    ? {}
    : Object.fromEntries(monthByUser.map((r) => [r.userId, r._sum?.amount ?? 0]));

  return {
    ...base,
    dailyTrajectory,
    topSellers: { today: topToday, week: topWeek, month: topMonth },
    byUserId,
    daysInMonth,
    todayDayOfMonth,
  };
}
