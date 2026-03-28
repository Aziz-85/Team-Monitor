/**
 * Metrics aggregator — single source of truth for sales and target KPIs.
 * All dates in Asia/Riyadh. Use with resolveMetricsScope for RBAC-consistent scope.
 * Money: SAR_INT only (SalesEntry.amount and target tables store integer riyals).
 * Sales aggregations read **SalesEntry** only; do not filter by `source` (origin metadata).
 *
 * Canonical flow:
 * - Manager/boutique performance: getPerformanceSummaryExtended → /api/performance/summary, /api/dashboard
 * - Employee targets: getTargetMetrics → /api/metrics/my-target, /api/me/targets
 * - Sales-only snapshot: getDashboardSalesMetrics → /api/metrics/dashboard
 * All percent calculations use lib/performance/performanceEngine.calculatePerformance.
 *
 * **Sales reads** are composed via `lib/sales/readSalesAggregate.ts` (single internal layer over SalesEntry).
 */

import { prisma } from '@/lib/db';
import {
  aggregateSalesEntrySum,
  getSalesMetricsFromSalesEntry,
  groupSalesByUserForBoutiqueMonth,
  salesEntryWhereForUserMonth,
  salesEntryWherePerformanceMonth,
} from '@/lib/sales/readSalesAggregate';
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
import { computeReportingAndPaceSnapshot } from '@/lib/targets/requiredPaceTargets';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { paceDaysPassedForMonth } from '@/lib/analytics/performanceLayer';

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

export async function getSalesMetrics(input: SalesMetricsInput): Promise<SalesMetricsResult> {
  if (!input.boutiqueId && !input.userId) {
    throw new Error('getSalesMetrics requires boutiqueId or userId');
  }
  return getSalesMetricsFromSalesEntry({
    boutiqueId: input.boutiqueId,
    userId: input.userId,
    from: input.from,
    toExclusive: input.toExclusive,
  });
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
  /** Operational: pace daily required (remaining month ÷ remaining days). */
  dailyTarget: number;
  /** Operational: sum of sequential daily-required for rest of Riyadh week in month. */
  weekTarget: number;
  /** Reporting: calendar slice of month target for today. */
  reportingDailyAllocationSar: number;
  /** Reporting: sum of daily allocations for days in the current Riyadh week ∩ month. */
  reportingWeeklyAllocationSar: number;
  paceDailyRequiredSar: number;
  paceWeeklyRequiredSar: number;
  /** max(monthTarget − MTD, 0) — gap still to reach month goal. */
  remainingMonthTargetSar: number;
  /** Signed monthTarget − MTD (negative = ahead of monthly target). */
  remaining: number;
  pctDaily: number;
  pctWeek: number;
  pctMonth: number;
  todayStr: string;
  todayInSelectedMonth: boolean;
  /** True when viewing current calendar month in Riyadh and the user has no SalesEntry rows for today. */
  dailyAchievementPending: boolean;
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

  const salesWhereBoutique = salesEntryWhereForUserMonth(
    input.userId,
    monthKey,
    input.employeeCrossBoutique ? null : input.boutiqueId
  );

  const [boutiqueTarget, employeeTargetResult, mtdSales, todaySales, weekSales, todayEntryCount] =
    await Promise.all([
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
    aggregateSalesEntrySum({ ...salesWhereBoutique, dateKey: { lte: todayStr } }),
    todayInSelectedMonth
      ? aggregateSalesEntrySum({ ...salesWhereBoutique, dateKey: todayStr })
      : Promise.resolve(0),
    weekInMonth
      ? aggregateSalesEntrySum({
          ...salesWhereBoutique,
          date: { gte: weekInMonth.start, lt: weekInMonth.end },
        })
      : Promise.resolve(0),
    todayInSelectedMonth
      ? prisma.salesEntry.count({ where: { ...salesWhereBoutique, dateKey: todayStr } })
      : Promise.resolve(0),
  ]);

  const monthTargetSar = input.employeeCrossBoutique
    ? (Array.isArray(employeeTargetResult) ? employeeTargetResult : []).reduce((s, r) => s + r.amount, 0)
    : (employeeTargetResult && !Array.isArray(employeeTargetResult) ? employeeTargetResult.amount : 0) ?? 0;
  const monthTarget = monthTargetSar;

  const todayDayOfMonth = todayDateOnly.getUTCDate();
  const targetSnap = computeReportingAndPaceSnapshot({
    monthTarget,
    mtdAchieved: mtdSales,
    daysInMonth,
    monthKey,
    todayDateKey: todayStr,
    todayDayOfMonth,
    todayInSelectedMonth,
    weekInMonth,
  });
  const dailyTarget = targetSnap.paceDailyRequiredSar;
  const weekTarget = targetSnap.paceWeeklyRequiredSar;

  const remaining = monthTarget - mtdSales;
  const dailyAchievementPending = todayInSelectedMonth && todayEntryCount === 0;
  const dailyPerf = dailyAchievementPending
    ? { target: dailyTarget, sales: 0, remaining: dailyTarget, percent: 0 }
    : calculatePerformance({ target: dailyTarget, sales: todaySales });
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
    reportingDailyAllocationSar: targetSnap.reportingDailyAllocationSar,
    reportingWeeklyAllocationSar: targetSnap.reportingWeeklyAllocationSar,
    paceDailyRequiredSar: targetSnap.paceDailyRequiredSar,
    paceWeeklyRequiredSar: targetSnap.paceWeeklyRequiredSar,
    remainingMonthTargetSar: targetSnap.remainingMonthTargetSar,
    remaining,
    pctDaily,
    pctWeek,
    pctMonth,
    todayStr,
    todayInSelectedMonth,
    dailyAchievementPending,
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

  const [boutiqueTarget, salesAgg] = await Promise.all([
    input.employeeOnly && input.userId
      ? prisma.employeeMonthlyTarget.findFirst({
          where: { boutiqueId: input.boutiqueId, month: monthKey, userId: input.userId },
        })
      : prisma.boutiqueMonthlyTarget.findFirst({
          where: { boutiqueId: input.boutiqueId, month: monthKey },
        }),
    groupSalesByUserForBoutiqueMonth(
      input.boutiqueId,
      monthKey,
      input.employeeOnly && input.userId ? input.userId : null
    ),
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
  /** Operational required pace vs actuals for the period. */
  daily: PerformancePeriod;
  weekly: PerformancePeriod;
  monthly: PerformancePeriod;
  /** Calendar allocation (reporting), not required pace. */
  reportingDailyAllocationSar: number;
  reportingWeeklyAllocationSar: number;
  paceDailyRequiredSar: number;
  paceWeeklyRequiredSar: number;
  remainingMonthTargetSar: number;
  /** Any SalesEntry row for Riyadh today in this metrics scope. */
  hasSalesEntryForToday: boolean;
  /** Completed business days in month for linear MTD pace (see paceDaysPassedForMonth). */
  paceDaysPassed: number;
  todayInSelectedMonth: boolean;
};

export type DailyTrajectoryPoint = {
  dateKey: string;
  targetCumulative: number;
  actualCumulative: number;
};

export type TopSellerEntry = {
  employeeId: string;
  employeeName: string;
  amount: number;
  rank: number;
};

export type TopSellersTodaySource = 'posted_today' | 'yesterday_fallback' | 'empty';

export type PerformanceSummaryExtendedResult = PerformanceSummaryResult & {
  monthKey: string;
  /** Latest calendar day ≤ Riyadh today with posted sales; if today has entries, equals today. */
  postedLastRecordedDateKey: string | null;
  postedLastRecordedDaySalesSar: number;
  dailyTrajectory: DailyTrajectoryPoint[];
  topSellers: {
    /** Deprecated: always empty; use posted last day + week/month top sellers only. */
    today: TopSellerEntry[];
    week: TopSellerEntry[];
    month: TopSellerEntry[];
    todaySource?: TopSellersTodaySource;
  };
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

  const wherePerf = salesEntryWherePerformanceMonth({
    monthKey: input.monthKey,
    boutiqueId: input.boutiqueId,
    userId: input.userId,
    employeeOnly: input.employeeOnly,
    employeeCrossBoutique: input.employeeCrossBoutique,
  });

  const [targetRow, targetRowsAll, mtdSales, todaySales, weekSales, salesEntryCountToday] =
    await Promise.all([
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
    aggregateSalesEntrySum({ ...wherePerf, dateKey: { lte: todayStr } }),
    todayInSelectedMonth
      ? aggregateSalesEntrySum({ ...wherePerf, dateKey: todayStr })
      : Promise.resolve(0),
    weekInMonth
      ? aggregateSalesEntrySum({
          ...wherePerf,
          date: { gte: weekInMonth.start, lt: weekInMonth.end },
        })
      : Promise.resolve(0),
    todayInSelectedMonth
      ? prisma.salesEntry.count({ where: { ...wherePerf, dateKey: todayStr } })
      : Promise.resolve(0),
  ]);

  const monthTarget =
    input.employeeCrossBoutique && targetRowsAll
      ? targetRowsAll.reduce((s, r) => s + r.amount, 0)
      : (targetRow?.amount ?? 0);

  const todayDayOfMonth = todayDateOnly.getUTCDate();
  const targetSnap = computeReportingAndPaceSnapshot({
    monthTarget,
    mtdAchieved: mtdSales,
    daysInMonth,
    monthKey,
    todayDateKey: todayStr,
    todayDayOfMonth,
    todayInSelectedMonth,
    weekInMonth,
  });
  const paceDaily = targetSnap.paceDailyRequiredSar;
  const paceWeekly = targetSnap.paceWeeklyRequiredSar;

  const hasSalesEntryForToday = !todayInSelectedMonth || salesEntryCountToday > 0;
  const paceDaysPassed = paceDaysPassedForMonth(
    todayDayOfMonth,
    daysInMonth,
    hasSalesEntryForToday
  );
  const dailyDayNotStarted = todayInSelectedMonth && !hasSalesEntryForToday;
  const daily = dailyDayNotStarted
    ? { target: paceDaily, sales: 0, remaining: paceDaily, percent: 0 }
    : calculatePerformance({ target: paceDaily, sales: todaySales });
  const weekly = calculatePerformance({ target: paceWeekly, sales: weekSales });
  const monthly = calculatePerformance({ target: monthTarget, sales: mtdSales });

  return {
    daily: { target: daily.target, sales: daily.sales, remaining: daily.remaining, percent: daily.percent },
    weekly: { target: weekly.target, sales: weekly.sales, remaining: weekly.remaining, percent: weekly.percent },
    monthly: { target: monthly.target, sales: monthly.sales, remaining: monthly.remaining, percent: monthly.percent },
    reportingDailyAllocationSar: targetSnap.reportingDailyAllocationSar,
    reportingWeeklyAllocationSar: targetSnap.reportingWeeklyAllocationSar,
    paceDailyRequiredSar: targetSnap.paceDailyRequiredSar,
    paceWeeklyRequiredSar: targetSnap.paceWeeklyRequiredSar,
    remainingMonthTargetSar: targetSnap.remainingMonthTargetSar,
    hasSalesEntryForToday,
    paceDaysPassed,
    todayInSelectedMonth,
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

  const wherePerf = salesEntryWherePerformanceMonth({
    monthKey: input.monthKey,
    boutiqueId: input.boutiqueId,
    userId: input.userId,
    employeeOnly: input.employeeOnly,
    employeeCrossBoutique: input.employeeCrossBoutique,
  });

  const hasSalesEntryForToday = base.hasSalesEntryForToday;

  const [salesByDate, weekByUser, monthByUser] = await Promise.all([
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: { ...wherePerf, dateKey: { lte: todayStr } },
      _sum: { amount: true },
    }),
    weekInMonth && !input.employeeOnly
      ? prisma.salesEntry.groupBy({
          by: ['userId'],
          where: { ...wherePerf, date: { gte: weekInMonth.start, lt: weekInMonth.end } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    !input.employeeOnly
      ? prisma.salesEntry.groupBy({
          by: ['userId'],
          where: { ...wherePerf, dateKey: { lte: todayStr } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const salesByDateKey = new Map(salesByDate.map((r) => [r.dateKey, r._sum?.amount ?? 0]));

  let postedLastRecordedDateKey: string | null = null;
  let postedLastRecordedDaySalesSar = 0;
  if (todayInSelectedMonth && hasSalesEntryForToday) {
    postedLastRecordedDateKey = todayStr;
    postedLastRecordedDaySalesSar = Math.floor(salesByDateKey.get(todayStr) ?? 0);
  } else {
    const prior = Array.from(salesByDateKey.entries())
      .filter(([dk, v]) => v > 0 && dk < todayStr)
      .sort((a, b) => b[0].localeCompare(a[0]))[0];
    if (prior) {
      postedLastRecordedDateKey = prior[0];
      postedLastRecordedDaySalesSar = Math.floor(prior[1]);
    }
  }

  const monthTarget = base.monthly.target;
  let cumTarget = 0;
  let cumActual = 0;
  const dailyTrajectory: DailyTrajectoryPoint[] = [];
  const [y, m] = monthKey.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const trajectoryLastDay =
    !todayInSelectedMonth
      ? 0
      : hasSalesEntryForToday
        ? todayDayOfMonth
        : Math.max(0, todayDayOfMonth - 1);
  for (let d = 1; d <= trajectoryLastDay; d++) {
    const dateKey = `${y}-${mm}-${String(d).padStart(2, '0')}`;
    cumTarget += getDailyTargetForDay(monthTarget, daysInMonth, d);
    cumActual += salesByDateKey.get(dateKey) ?? 0;
    dailyTrajectory.push({ dateKey, targetCumulative: cumTarget, actualCumulative: cumActual });
  }

  const pickTop3 = async (
    rows: { userId: string; _sum: { amount: number | null } }[]
  ): Promise<TopSellerEntry[]> => {
    if (rows.length === 0) return [];
    const sorted = [...rows]
      .map((r) => ({ userId: r.userId, amount: Math.floor(r._sum?.amount ?? 0) }))
      .sort((a, b) => b.amount - a.amount);
    const top3 = sorted.slice(0, 3).filter((r) => r.amount > 0);
    if (top3.length === 0) return [];
    const userIds = top3.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, empId: true, employee: { select: { name: true } } },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return top3.map((r, i) => {
      const u = userMap.get(r.userId);
      const name = u?.employee?.name ?? u?.empId ?? r.userId;
      return {
        employeeId: u?.empId ?? r.userId,
        employeeName: name,
        amount: r.amount,
        rank: i + 1,
      };
    });
  };

  const [topWeek, topMonth] = await Promise.all([pickTop3(weekByUser), pickTop3(monthByUser)]);

  const byUserId: Record<string, number> = input.employeeOnly
    ? {}
    : Object.fromEntries(monthByUser.map((r) => [r.userId, r._sum?.amount ?? 0]));

  return {
    ...base,
    monthKey,
    postedLastRecordedDateKey,
    postedLastRecordedDaySalesSar,
    dailyTrajectory,
    topSellers: { today: [], week: topWeek, month: topMonth },
    byUserId,
    daysInMonth,
    todayDayOfMonth,
  };
}
