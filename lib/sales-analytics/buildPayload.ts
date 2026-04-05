/**
 * Assembles production sales analytics from SalesEntry + BoutiqueMonthlyTarget + EmployeeMonthlyTarget.
 */

import { prisma } from '@/lib/db';
import { aggregateSalesEntrySum } from '@/lib/sales/readSalesAggregate';
import type { SalesScopeResult } from '@/lib/sales/ledgerRbac';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';
import { paceDaysPassedForMonth, computePaceMetrics, computeForecast } from '@/lib/analytics/performanceLayer';
import { remainingMonthTargetSar, dailyRequiredTargetSar } from '@/lib/targets/requiredPaceTargets';
import {
  getDaysInMonth,
  normalizeMonthKey,
  addMonths,
  toRiyadhDateString,
  getRiyadhNow,
  normalizeDateOnlyRiyadh,
  getDaysRemainingInMonthIncluding,
} from '@/lib/time';
import { isOperationalEmployee } from '@/lib/userClassification';
import { deltaAndPct, signalFromDeltaPct } from '@/lib/sales-analytics/comparisons';
import { buildSalesAnalyticsInsights } from '@/lib/sales-analytics/insights';
import type {
  SalesAnalyticsPayload,
  SalesAnalyticsComparison,
  SalesAnalyticsRankRow,
  SalesAnalyticsBarItem,
} from '@/lib/sales-analytics/types';

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const d = normalizeDateOnlyRiyadh(dateKey);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return toRiyadhDateString(d);
}

function rankTopLow(rows: { id: string; name: string; sales: number; target: number; contributionPct: number }[], max = 5) {
  const withAch = rows.map((r) => {
    const perf = calculatePerformance({ target: r.target, sales: r.sales });
    return {
      ...r,
      achPct: perf.percent,
    };
  });
  const byAchDesc = [...withAch].sort((a, b) => {
    if (b.achPct !== a.achPct) return b.achPct - a.achPct;
    return b.sales - a.sales;
  });
  const byAchAsc = [...withAch].sort((a, b) => {
    if (a.achPct !== b.achPct) return a.achPct - b.achPct;
    return a.sales - b.sales;
  });
  const toRank = (arr: typeof withAch, take: number): SalesAnalyticsRankRow[] =>
    arr.slice(0, take).map((r, i) => ({
      rank: i + 1,
      id: r.id,
      name: r.name,
      sales: r.sales,
      target: r.target,
      achPct: r.achPct,
      contributionPct: r.contributionPct,
    }));
  return { top: toRank(byAchDesc, max), low: toRank(byAchAsc, max) };
}

export async function buildSalesAnalyticsPayload(
  scope: SalesScopeResult,
  asOfDateKey: string
): Promise<SalesAnalyticsPayload> {
  const mk = /^(\d{4}-\d{2}-\d{2})$/.exec(asOfDateKey.trim());
  if (!mk) {
    throw new Error('INVALID_DATE');
  }

  const riyadhTodayStr = toRiyadhDateString(getRiyadhNow());
  let asOf = asOfDateKey.trim();
  if (asOf > riyadhTodayStr) {
    asOf = riyadhTodayStr;
  }

  const monthKey = normalizeMonthKey(asOf.slice(0, 7));
  const parsed = monthKey.split('-').map(Number);
  const year = parsed[0];
  const month1 = parsed[1];
  if (!Number.isFinite(year) || !Number.isFinite(month1)) {
    throw new Error('INVALID_MONTH');
  }

  const boutiqueId = scope.effectiveBoutiqueId;
  if (!boutiqueId) {
    throw new Error('NO_BOUTIQUE');
  }

  const daysInMonth = getDaysInMonth(monthKey);
  const dayOfMonth = Math.min(Math.max(1, parseInt(asOf.slice(8, 10), 10)), daysInMonth);
  const monthStart = new Date(Date.UTC(year, month1 - 1, 1, 0, 0, 0, 0));
  const asOfDate = normalizeDateOnlyRiyadh(asOf);

  const branchScopeIds = Array.from(new Set(scope.allowedBoutiqueIds.filter(Boolean)));
  const branchIds = branchScopeIds.length > 0 ? branchScopeIds : [boutiqueId];

  const [
    boutique,
    monthTargetRow,
    hasEntryAsOf,
    todaySales,
    yesterdaySales,
    weekAgoSales,
    mtdSales,
    salesByDay,
    prevMonthMtd,
  ] = await Promise.all([
    prisma.boutique.findUnique({
      where: { id: boutiqueId },
      select: { id: true, name: true, code: true },
    }),
    prisma.boutiqueMonthlyTarget.findUnique({
      where: { boutiqueId_month: { boutiqueId, month: monthKey } },
      select: { amount: true },
    }),
    prisma.salesEntry.count({
      where: { boutiqueId, dateKey: asOf },
    }),
    aggregateSalesEntrySum({
      boutiqueId,
      date: { gte: asOfDate, lte: asOfDate },
    }),
    aggregateSalesEntrySum({
      boutiqueId,
      date: { gte: normalizeDateOnlyRiyadh(shiftDateKey(asOf, -1)), lte: normalizeDateOnlyRiyadh(shiftDateKey(asOf, -1)) },
    }),
    aggregateSalesEntrySum({
      boutiqueId,
      date: { gte: normalizeDateOnlyRiyadh(shiftDateKey(asOf, -7)), lte: normalizeDateOnlyRiyadh(shiftDateKey(asOf, -7)) },
    }),
    aggregateSalesEntrySum({
      boutiqueId,
      date: { gte: monthStart, lte: asOfDate },
    }),
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: {
        boutiqueId,
        month: monthKey,
        date: { gte: monthStart, lte: asOfDate },
      },
      _sum: { amount: true },
    }),
    (async () => {
      const prevMk = addMonths(monthKey, -1);
      const dimPrev = getDaysInMonth(prevMk);
      const endD = Math.min(dayOfMonth, dimPrev);
      const prevStart = normalizeDateOnlyRiyadh(`${prevMk}-01`);
      const prevEnd = normalizeDateOnlyRiyadh(`${prevMk}-${String(endD).padStart(2, '0')}`);
      return aggregateSalesEntrySum({
        boutiqueId,
        date: { gte: prevStart, lte: prevEnd },
      });
    })(),
  ]);

  const monthTargetSar = monthTargetRow?.amount ?? 0;
  const dailyTargetSar = getDailyTargetForDay(monthTargetSar, daysInMonth, dayOfMonth);
  const dailyPerf = calculatePerformance({ target: dailyTargetSar, sales: todaySales });
  const mtdPerf = calculatePerformance({ target: monthTargetSar, sales: mtdSales });
  const remainingSar = mtdPerf.remaining;

  const pacePassed = paceDaysPassedForMonth(dayOfMonth, daysInMonth, hasEntryAsOf > 0);
  const pace = computePaceMetrics({
    actualMTD: mtdSales,
    monthlyTarget: monthTargetSar,
    totalDaysInMonth: daysInMonth,
    daysPassed: pacePassed,
  });
  const forecast = computeForecast({
    actualMTD: mtdSales,
    monthlyTarget: monthTargetSar,
    totalDaysInMonth: daysInMonth,
    daysPassed: pacePassed,
  });

  const remMonth = remainingMonthTargetSar(monthTargetSar, mtdSales);
  const daysRem = getDaysRemainingInMonthIncluding(monthKey, asOf);
  const requiredDailyPaceSar = dailyRequiredTargetSar(remMonth, daysRem);

  const expectedLinear = pace.expectedToDate;

  const { delta: dY, deltaPct: pY } = deltaAndPct(todaySales, yesterdaySales);
  const { delta: dW, deltaPct: pW } = deltaAndPct(todaySales, weekAgoSales);
  const { delta: dM, deltaPct: pM } = deltaAndPct(mtdSales, prevMonthMtd);
  const { delta: dT, deltaPct: pT } = deltaAndPct(mtdSales, monthTargetSar);
  const { delta: dP, deltaPct: pP } = deltaAndPct(mtdSales, expectedLinear);

  const comparisons: SalesAnalyticsComparison[] = [
    {
      id: 'todayVsYesterday',
      current: todaySales,
      reference: yesterdaySales,
      delta: dY,
      deltaPct: pY,
      signal: signalFromDeltaPct(pY),
    },
    {
      id: 'todayVsLastWeek',
      current: todaySales,
      reference: weekAgoSales,
      delta: dW,
      deltaPct: pW,
      signal: signalFromDeltaPct(pW),
    },
    {
      id: 'mtdVsLastMonthMtd',
      current: mtdSales,
      reference: prevMonthMtd,
      delta: dM,
      deltaPct: pM,
      signal: signalFromDeltaPct(pM),
    },
    {
      id: 'mtdActualVsTarget',
      current: mtdSales,
      reference: monthTargetSar,
      delta: dT,
      deltaPct: pT,
      signal: signalFromDeltaPct(pT),
    },
    {
      id: 'mtdActualVsPace',
      current: mtdSales,
      reference: expectedLinear,
      delta: dP,
      deltaPct: pP,
      signal: signalFromDeltaPct(pP),
    },
  ];

  const salesByDateKey = new Map(salesByDay.map((r) => [r.dateKey, r._sum.amount ?? 0]));
  let cumTarget = 0;
  let cumActual = 0;
  const dailyTrajectory: SalesAnalyticsPayload['dailyTrajectory'] = [];
  const mm = String(month1).padStart(2, '0');
  for (let d = 1; d <= dayOfMonth; d++) {
    const dateKey = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    cumTarget += getDailyTargetForDay(monthTargetSar, daysInMonth, d);
    cumActual += salesByDateKey.get(dateKey) ?? 0;
    dailyTrajectory.push({ dateKey, targetCumulative: cumTarget, actualCumulative: cumActual });
  }

  const boutiquesMeta = await prisma.boutique.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true, code: true },
  });
  const boutiqueMetaMap = new Map(boutiquesMeta.map((b) => [b.id, b]));

  const branchAgg = await Promise.all(
    branchIds.map(async (bid) => {
      const [mtd, tgt] = await Promise.all([
        aggregateSalesEntrySum({
          boutiqueId: bid,
          date: { gte: monthStart, lte: asOfDate },
        }),
        prisma.boutiqueMonthlyTarget.findUnique({
          where: { boutiqueId_month: { boutiqueId: bid, month: monthKey } },
          select: { amount: true },
        }),
      ]);
      const meta = boutiqueMetaMap.get(bid);
      return {
        id: bid,
        name: meta ? `${meta.name} (${meta.code})` : bid,
        sales: mtd,
        target: tgt?.amount ?? 0,
      };
    })
  );

  const totalBranchSales = branchAgg.reduce((s, b) => s + b.sales, 0);
  const branchRowsForRank = branchAgg.map((b) => ({
    id: b.id,
    name: b.name,
    sales: b.sales,
    target: b.target,
    contributionPct:
      totalBranchSales > 0 ? Math.min(100, Math.max(0, Math.round((b.sales * 100) / totalBranchSales))) : 0,
  }));
  const branches = rankTopLow(branchRowsForRank);

  const empGroups = await prisma.salesEntry.groupBy({
    by: ['userId'],
    where: {
      boutiqueId,
      month: monthKey,
      date: { gte: monthStart, lte: asOfDate },
    },
    _sum: { amount: true },
  });

  const userIds = empGroups.map((g) => g.userId);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            empId: true,
            employee: { select: { name: true, empId: true, isSystemOnly: true } },
          },
        })
      : [];

  const empTargets = await prisma.employeeMonthlyTarget.findMany({
    where: { boutiqueId, month: monthKey, userId: { in: userIds } },
    select: { userId: true, amount: true },
  });
  const targetByUser = new Map(empTargets.map((t) => [t.userId, t.amount]));

  const employeeRows: { id: string; name: string; sales: number; target: number; contributionPct: number }[] = [];
  for (const g of empGroups) {
    const u = users.find((x) => x.id === g.userId);
    const emp = u?.employee;
    if (!emp || !isOperationalEmployee(emp)) continue;
    const sales = g._sum.amount ?? 0;
    const target = targetByUser.get(g.userId) ?? 0;
    employeeRows.push({
      id: g.userId,
      name: emp.name ?? u?.empId ?? g.userId,
      sales,
      target,
      contributionPct:
        mtdSales > 0 ? Math.min(100, Math.max(0, Math.round((sales * 100) / mtdSales))) : 0,
    });
  }

  const employees = rankTopLow(employeeRows);

  const employeeBars: SalesAnalyticsBarItem[] = [...employeeRows]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 12)
    .map((e) => ({
      label: e.name,
      value: e.sales,
      max: Math.max(e.sales, e.target, 1),
    }));

  const sortedBranchBySales = [...branchAgg].sort((a, b) => b.sales - a.sales);
  let branchTopSharePct: number | null = null;
  if (sortedBranchBySales.length > 1 && totalBranchSales > 0) {
    branchTopSharePct = Math.round((sortedBranchBySales[0].sales * 100) / totalBranchSales);
  }

  const sortedEmp = [...employeeRows].sort((a, b) => b.sales - a.sales);
  let employeeTopSharePct: number | null = null;
  if (sortedEmp.length > 1 && mtdSales > 0) {
    employeeTopSharePct = Math.round((sortedEmp[0].sales * 100) / mtdSales);
  }

  const insights = buildSalesAnalyticsInsights({
    mtdAchPct: mtdPerf.percent,
    mtdTargetSar: monthTargetSar,
    mtdSalesSar: mtdSales,
    remainingSar,
    forecastEomSar: forecast.forecastedTotal,
    todayVsYesterdayDeltaPct: pY,
    todayVsWeekAgoDeltaPct: pW,
    mtdVsPrevMonthDeltaPct: pM,
    paceBand: pace.band,
    branchTopSharePct,
    employeeTopSharePct,
    requiredDailyPaceSar,
  });

  return {
    asOf,
    monthKey,
    boutiqueId,
    boutiqueName: boutique?.name ?? '—',
    boutiqueCode: boutique?.code ?? '',
    branchScopeBoutiqueIds: branchIds,
    kpis: {
      todaySales,
      dailyTargetSar,
      dailyAchPct: dailyPerf.percent,
      mtdSales,
      mtdTargetSar: monthTargetSar,
      mtdAchPct: mtdPerf.percent,
      remainingSar,
      requiredDailyPaceSar,
      forecastEomSar: forecast.forecastedTotal,
      expectedMtdLinearSar: expectedLinear,
      paceDaysPassed: pacePassed,
      daysInMonth,
    },
    comparisons,
    branches,
    employees,
    dailyTrajectory,
    employeeBars,
    insights,
  };
}
