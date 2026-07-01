/**
 * Executive Store Performance Report — data layer.
 * Aggregates SalesEntry, targets, StoreReportKpi, and zone (region) comparisons.
 */

import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import {
  aggregateSalesEntrySum,
} from '@/lib/sales/readSalesAggregate';
import { getSystemBranchTotalUserId } from '@/lib/sales/systemBranchTotal';
import {
  formatDateRiyadh,
  getDaysInMonth,
  getDaysRemainingInMonthIncluding,
  getRiyadhNow,
  parseMonthKey,
  toRiyadhDateString,
} from '@/lib/time';
import {
  formatStoreReportPeriodLabel,
  getDefaultStoreReportPeriodQuery,
  getMonthKeysForPeriod,
  getStoreReportPeriodBounds,
  storeReportPeriodFromMonthKey,
  type StoreReportPeriodKind,
  type StoreReportPeriodQuery,
} from '@/lib/reports/storeReportPeriod';

export type { StoreReportPeriodKind, StoreReportPeriodQuery };

/** Default discount target when not stored in StoreReportKpi (percentage). */
export const DEFAULT_DISCOUNT_TARGET_PCT = 10;

const REPORT_ROLES: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export class StoreReportError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_MONTH',
    message: string
  ) {
    super(message);
    this.name = 'StoreReportError';
  }
}

export type TeamPerformanceRow = {
  userId: string;
  employeeName: string;
  target: number;
  actual: number;
  achievementPct: number;
  discountPct: number | null;
  isTotal?: boolean;
};

export type MonthlyChartPoint = {
  monthKey: string;
  label: string;
  currentYear: number;
  lastYear: number;
  target: number;
};

export type StoreReportPayload = {
  meta: {
    boutiqueId: string;
    boutiqueName: string;
    boutiqueCode: string;
    regionName: string | null;
    monthKey: string;
    asOfDateKey: string;
    generatedAt: string;
    periodKind: StoreReportPeriodKind;
    periodLabel: string;
    periodYear: number;
    periodMonth?: number;
    periodQuarter?: 1 | 2 | 3 | 4;
    periodHalf?: 1 | 2;
    showClosingExpectation: boolean;
  };
  storeDetail: {
    kpis: {
      mtdSales: number;
      distributedTarget: number;
      budgetTarget: number;
      vsDistributedTargetPct: number;
      vsBudgetTargetPct: number;
      discountPct: number;
    };
    closingExpectation: {
      mtdPerformancePct: number;
      runRateRemainingMonth: number;
      pipelineDeals: number;
      projectedClosing: number;
      projectedAchievementPct: number;
      budgetTarget: number;
    };
    teamPerformance: TeamPerformanceRow[];
    additionalKpis: {
      footfall: number | null;
      conversionRate: number | null;
      crmRegistrationRate: number | null;
    };
    teamHighlights: {
      topPerformer: { name: string; achievementPct: number } | null;
      laggingPerformer: { name: string; achievementPct: number } | null;
      employeesAboveTarget: number;
      discountWarning: boolean;
      discountTargetPct: number;
    };
  };
  ytdPerformance: {
    boutique: {
      revenueYtd: number;
      vsLastYearPct: number | null;
      pctOfTarget: number | null;
      targetYtd: number;
      lastYearYtd: number;
    };
    zone: {
      zoneName: string | null;
      revenueYtd: number;
      vsLastYearPct: number | null;
      pctOfTarget: number | null;
      targetYtd: number;
      lastYearYtd: number;
      boutiqueShareOfZonePct: number | null;
    };
    charts: {
      boutiqueMonthly: MonthlyChartPoint[];
      zoneMonthly: MonthlyChartPoint[];
    };
    snapshot: {
      boutiqueText: string;
      zoneText: string;
    };
  };
};

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) * 100) / previous);
}

function computeDiscountPct(grossHalalas: number, netHalalas: number): number | null {
  if (grossHalalas <= 0) return null;
  return Math.round(((grossHalalas - netHalalas) * 100) / grossHalalas);
}

function monthLabel(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parsed.m - 1] ?? monthKey;
}

function ytdMonthKeys(year: number, throughMonth: number): string[] {
  const keys: string[] = [];
  for (let m = 1; m <= throughMonth; m++) {
    keys.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

async function sumSalesForBoutiquesDateRange(
  boutiqueIds: string[],
  fromDateKey: string,
  toDateKey: string
): Promise<number> {
  if (boutiqueIds.length === 0) return 0;
  return aggregateSalesEntrySum({
    boutiqueId: { in: boutiqueIds },
    dateKey: { gte: fromDateKey, lte: toDateKey },
  });
}

async function sumTargetsForBoutiquesMonths(
  boutiqueIds: string[],
  monthKeys: string[]
): Promise<number> {
  if (boutiqueIds.length === 0 || monthKeys.length === 0) return 0;
  const rows = await prisma.boutiqueMonthlyTarget.findMany({
    where: { boutiqueId: { in: boutiqueIds }, month: { in: monthKeys } },
    select: { amount: true },
  });
  return rows.reduce((s, r) => s + r.amount, 0);
}

async function buildMonthlyChartForMonths(
  boutiqueIds: string[],
  monthKeys: string[]
): Promise<MonthlyChartPoint[]> {
  const points: MonthlyChartPoint[] = [];

  for (const mk of monthKeys) {
    const parsed = parseMonthKey(mk);
    if (!parsed) continue;
    const year = parsed.y;
    const m = parsed.m;
    const lyYear = year - 1;
    const lyMk = `${lyYear}-${String(m).padStart(2, '0')}`;
    const dim = getDaysInMonth(mk);
    const mm = String(m).padStart(2, '0');
    const startKey = `${year}-${mm}-01`;
    const endKey = `${year}-${mm}-${String(dim).padStart(2, '0')}`;
    const lyDim = getDaysInMonth(lyMk);
    const lyStart = `${lyYear}-${mm}-01`;
    const lyEnd = `${lyYear}-${mm}-${String(lyDim).padStart(2, '0')}`;

    const [cySales, lySales, targetRows] = await Promise.all([
      sumSalesForBoutiquesDateRange(boutiqueIds, startKey, endKey),
      sumSalesForBoutiquesDateRange(boutiqueIds, lyStart, lyEnd),
      prisma.boutiqueMonthlyTarget.findMany({
        where: { boutiqueId: { in: boutiqueIds }, month: mk },
        select: { amount: true },
      }),
    ]);

    points.push({
      monthKey: mk,
      label: monthLabel(mk),
      currentYear: cySales,
      lastYear: lySales,
      target: targetRows.reduce((s, r) => s + r.amount, 0),
    });
  }

  return points;
}

async function buildMonthlyChart(
  boutiqueIds: string[],
  year: number,
  throughMonth: number
): Promise<MonthlyChartPoint[]> {
  const points: MonthlyChartPoint[] = [];
  const lyYear = year - 1;

  for (let m = 1; m <= throughMonth; m++) {
    const mk = `${year}-${String(m).padStart(2, '0')}`;
    const lyMk = `${lyYear}-${String(m).padStart(2, '0')}`;
    const { startKey, endKey } = (() => {
      const dim = getDaysInMonth(mk);
      const mm = String(m).padStart(2, '0');
      return {
        startKey: `${year}-${mm}-01`,
        endKey: `${year}-${mm}-${String(dim).padStart(2, '0')}`,
      };
    })();
    const lyDim = getDaysInMonth(lyMk);
    const lyStart = `${lyYear}-${String(m).padStart(2, '0')}-01`;
    const lyEnd = `${lyYear}-${String(m).padStart(2, '0')}-${String(lyDim).padStart(2, '0')}`;

    const [cySales, lySales, targetRows] = await Promise.all([
      sumSalesForBoutiquesDateRange(boutiqueIds, startKey, endKey),
      sumSalesForBoutiquesDateRange(boutiqueIds, lyStart, lyEnd),
      prisma.boutiqueMonthlyTarget.findMany({
        where: { boutiqueId: { in: boutiqueIds }, month: mk },
        select: { amount: true },
      }),
    ]);

    points.push({
      monthKey: mk,
      label: monthLabel(mk),
      currentYear: cySales,
      lastYear: lySales,
      target: targetRows.reduce((s, r) => s + r.amount, 0),
    });
  }

  return points;
}

function buildSnapshotText(input: {
  label: string;
  pctOfTarget: number | null;
  vsLastYearPct: number | null;
  shareOfZonePct?: number | null;
}): string {
  const parts: string[] = [];
  if (input.pctOfTarget != null) {
    parts.push(`${input.pctOfTarget}% of target`);
  }
  if (input.vsLastYearPct != null) {
    const sign = input.vsLastYearPct >= 0 ? '+' : '';
    parts.push(`${sign}${input.vsLastYearPct}% vs last year`);
  }
  if (input.shareOfZonePct != null) {
    parts.push(`contributes ${input.shareOfZonePct}% of zone revenue`);
  }
  if (parts.length === 0) return `${input.label}: insufficient data.`;
  return `${input.label}: ${parts.join(', ')}.`;
}

export async function assertStoreReportAccess(
  role: Role,
  requestedBoutiqueId: string
): Promise<void> {
  if (!REPORT_ROLES.includes(role)) {
    throw new StoreReportError('FORBIDDEN', 'Insufficient permissions');
  }

  const boutique = await prisma.boutique.findUnique({
    where: { id: requestedBoutiqueId },
    select: { id: true, isActive: true },
  });
  if (!boutique?.isActive) {
    throw new StoreReportError('NOT_FOUND', 'Boutique not found');
  }

  if (role === 'SUPER_ADMIN') return;

  const scope = await getOperationalScope();
  const allowed = scope?.boutiqueIds ?? (scope?.boutiqueId ? [scope.boutiqueId] : []);
  if (!allowed.includes(requestedBoutiqueId)) {
    throw new StoreReportError('FORBIDDEN', 'Boutique not in scope');
  }
}

async function sumEmployeeTargetsForMonths(
  boutiqueId: string,
  monthKeys: string[]
): Promise<Map<string, number>> {
  if (monthKeys.length === 0) return new Map();
  const rows = await prisma.employeeMonthlyTarget.findMany({
    where: { boutiqueId, month: { in: monthKeys } },
    select: { userId: true, amount: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.userId, (map.get(row.userId) ?? 0) + row.amount);
  }
  return map;
}

async function groupSalesByUserForBoutiqueDateRange(
  boutiqueId: string,
  fromDateKey: string,
  toDateKey: string
) {
  return prisma.salesEntry.groupBy({
    by: ['userId'],
    where: {
      boutiqueId,
      dateKey: { gte: fromDateKey, lte: toDateKey },
    },
    _sum: { amount: true },
  });
}

function shiftDateKeyYear(dateKey: string, deltaYears: number): string {
  const y = Number(dateKey.slice(0, 4));
  return `${y + deltaYears}${dateKey.slice(4)}`;
}

function resolveStoreReportQuery(
  queryInput?: StoreReportPeriodQuery | string
): StoreReportPeriodQuery {
  if (typeof queryInput === 'string') {
    return storeReportPeriodFromMonthKey(queryInput);
  }
  return queryInput ?? getDefaultStoreReportPeriodQuery();
}

export async function buildStoreReport(
  boutiqueId: string,
  queryInput?: StoreReportPeriodQuery | string
): Promise<StoreReportPayload> {
  const periodQuery = resolveStoreReportQuery(queryInput);
  const monthKeys = getMonthKeysForPeriod(periodQuery);
  const anchorMonthKey = monthKeys[monthKeys.length - 1]!;
  if (!parseMonthKey(anchorMonthKey)) {
    throw new StoreReportError('INVALID_MONTH', 'Invalid period');
  }

  const now = getRiyadhNow();
  const todayKey = toRiyadhDateString(now);
  const bounds = getStoreReportPeriodBounds(periodQuery, todayKey);
  const { fromDateKey, toDateKey, showClosingExpectation, chartMonthKeys } = bounds;
  const asOfDateKey = toDateKey;

  const parsed = parseMonthKey(anchorMonthKey)!;
  const year = parsed.y;
  const isSingleMonth = periodQuery.kind === 'month';
  const monthKey = anchorMonthKey;

  const dayOfMonth = isSingleMonth ? Number(asOfDateKey.slice(8, 10)) : getDaysInMonth(anchorMonthKey);
  const daysRemaining = isSingleMonth
    ? getDaysRemainingInMonthIncluding(monthKey, asOfDateKey)
    : 0;
  const daysPassed = Math.max(1, dayOfMonth);

  const rangeStart = new Date(fromDateKey + 'T12:00:00.000Z');
  const asOfDate = new Date(asOfDateKey + 'T12:00:00.000Z');
  const monthStart = rangeStart;

  const [
    boutique,
    budgetTargetRows,
    employeeTargetMap,
    periodSales,
    salesByUser,
    storeKpiRows,
    txnDiscountAgg,
    txnDiscountByEmployee,
    systemBranchUserId,
    users,
    zoneBoutiqueIds,
  ] = await Promise.all([
    prisma.boutique.findUnique({
      where: { id: boutiqueId },
      select: {
        id: true,
        name: true,
        code: true,
        regionId: true,
        region: { select: { name: true } },
      },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: { boutiqueId, month: { in: monthKeys } },
      select: { amount: true },
    }),
    sumEmployeeTargetsForMonths(boutiqueId, monthKeys),
    aggregateSalesEntrySum({
      boutiqueId,
      dateKey: { gte: fromDateKey, lte: toDateKey },
    }),
    groupSalesByUserForBoutiqueDateRange(boutiqueId, fromDateKey, toDateKey),
    prisma.storeReportKpi.findMany({
      where: { boutiqueId, month: { in: monthKeys } },
    }),
    prisma.salesTransaction.aggregate({
      where: {
        boutiqueId,
        type: 'SALE',
        txnDate: { gte: monthStart, lte: asOfDate },
      },
      _sum: { grossAmount: true, netAmount: true },
    }),
    prisma.salesTransaction.groupBy({
      by: ['employeeId'],
      where: {
        boutiqueId,
        type: 'SALE',
        txnDate: { gte: monthStart, lte: asOfDate },
      },
      _sum: { grossAmount: true, netAmount: true },
    }),
    getSystemBranchTotalUserId(),
    prisma.user.findMany({
      where: {
        employee: { boutiqueId, active: true, isSystemOnly: false },
      },
      select: {
        id: true,
        employee: { select: { name: true, empId: true } },
      },
    }),
    prisma.boutique
      .findUnique({ where: { id: boutiqueId }, select: { regionId: true } })
      .then(async (b) => {
        if (!b?.regionId) return [boutiqueId];
        const rows = await prisma.boutique.findMany({
          where: { regionId: b.regionId, isActive: true },
          select: { id: true },
        });
        return rows.map((r) => r.id);
      }),
  ]);

  if (!boutique) {
    throw new StoreReportError('NOT_FOUND', 'Boutique not found');
  }

  const budgetTarget = budgetTargetRows.reduce((s, r) => s + r.amount, 0);
  const distributedTarget = Array.from(employeeTargetMap.values()).reduce((s, v) => s + v, 0);
  const mtdSales = periodSales;
  const budgetPerf = calculatePerformance({ target: budgetTarget, sales: mtdSales });
  const distributedPerf = calculatePerformance({ target: distributedTarget, sales: mtdSales });

  const storeKpi =
    storeKpiRows.length === 1
      ? storeKpiRows[0]!
      : storeKpiRows.length > 1
        ? {
            footfall: storeKpiRows.reduce((s, r) => s + (r.footfall ?? 0), 0),
            conversionRate: (() => {
              const vals = storeKpiRows.map((r) => r.conversionRate).filter((v) => v != null);
              return vals.length ? Math.round(vals.reduce((s, v) => s + v!, 0) / vals.length) : null;
            })(),
            crmRate: (() => {
              const vals = storeKpiRows.map((r) => r.crmRate).filter((v) => v != null);
              return vals.length ? Math.round(vals.reduce((s, v) => s + v!, 0) / vals.length) : null;
            })(),
            pipelineAmount: storeKpiRows.reduce((s, r) => s + (r.pipelineAmount ?? 0), 0),
            discountRate: storeKpiRows.find((r) => r.discountRate != null)?.discountRate ?? null,
          }
        : null;

  const txnDiscount =
    computeDiscountPct(
      txnDiscountAgg._sum.grossAmount ?? 0,
      txnDiscountAgg._sum.netAmount ?? 0
    ) ?? storeKpi?.discountRate ?? 0;
  const discountPct = Math.round(txnDiscount);

  const daysAfterToday = showClosingExpectation ? Math.max(0, daysRemaining - 1) : 0;
  const dailyRunRate = showClosingExpectation && daysPassed > 0 ? Math.round(mtdSales / daysPassed) : 0;
  const runRateRemainingMonth = dailyRunRate * daysAfterToday;
  const pipelineDeals = showClosingExpectation ? (storeKpi?.pipelineAmount ?? 0) : 0;
  const projectedClosing = showClosingExpectation
    ? mtdSales + runRateRemainingMonth + pipelineDeals
    : mtdSales;
  const projectedAchievementPct =
    showClosingExpectation && budgetTarget > 0
      ? Math.round((projectedClosing * 100) / budgetTarget)
      : budgetPerf.percent;

  const salesMap = new Map(
    salesByUser
      .filter((r) => !systemBranchUserId || r.userId !== systemBranchUserId)
      .map((r) => [r.userId, r._sum.amount ?? 0])
  );

  const empIdToDiscount = new Map<string, number>();
  for (const row of txnDiscountByEmployee) {
    const d = computeDiscountPct(row._sum.grossAmount ?? 0, row._sum.netAmount ?? 0);
    if (d != null) empIdToDiscount.set(row.employeeId, d);
  }

  const teamRows: TeamPerformanceRow[] = users.map((u) => {
    const actual = salesMap.get(u.id) ?? 0;
    const target = employeeTargetMap.get(u.id) ?? 0;
    const achievementPct = calculatePerformance({ target, sales: actual }).percent;
    const empId = u.employee?.empId ?? '';
    const rowDiscount = empIdToDiscount.get(empId) ?? (discountPct > 0 ? discountPct : null);
    return {
      userId: u.id,
      employeeName: u.employee?.name ?? u.employee?.empId ?? u.id,
      target,
      actual,
      achievementPct,
      discountPct: rowDiscount,
    };
  });

  teamRows.sort((a, b) => b.achievementPct - a.achievementPct);

  const storeTotal: TeamPerformanceRow = {
    userId: '__total__',
    employeeName: 'STORE TOTAL',
    target: distributedTarget > 0 ? distributedTarget : budgetTarget,
    actual: mtdSales,
    achievementPct: calculatePerformance({
      target: distributedTarget > 0 ? distributedTarget : budgetTarget,
      sales: mtdSales,
    }).percent,
    discountPct,
    isTotal: true,
  };

  const performersWithTarget = teamRows.filter((r) => r.target > 0);
  const topPerformer = performersWithTarget[0]
    ? { name: performersWithTarget[0].employeeName, achievementPct: performersWithTarget[0].achievementPct }
    : null;
  const laggingPerformer = performersWithTarget.length
    ? (() => {
        const sorted = [...performersWithTarget].sort((a, b) => a.achievementPct - b.achievementPct);
        return { name: sorted[0]!.employeeName, achievementPct: sorted[0]!.achievementPct };
      })()
    : null;
  const employeesAboveTarget = performersWithTarget.filter((r) => r.achievementPct >= 100).length;
  const discountTargetPct = DEFAULT_DISCOUNT_TARGET_PCT;
  const discountWarning = discountPct > discountTargetPct;

  const lyFrom = shiftDateKeyYear(fromDateKey, -1);
  const lyTo = shiftDateKeyYear(toDateKey, -1);

  let boutiqueYtd: number;
  let boutiqueLyYtd: number;
  let boutiqueTargetYtd: number;
  let zoneYtd: number;
  let zoneLyYtd: number;
  let zoneTargetYtd: number;
  let boutiqueMonthly: MonthlyChartPoint[];
  let zoneMonthly: MonthlyChartPoint[];
  let comparisonLabel: string;

  if (periodQuery.kind === 'month') {
    const ytdFrom = `${year}-01-01`;
    const lyYear = year - 1;
    const lyAsOf = `${lyYear}-${asOfDateKey.slice(5)}`;
    const lyYtdFrom = `${lyYear}-01-01`;
    const ytdMonthKeysList = ytdMonthKeys(year, parsed.m);
    comparisonLabel = 'Boutique YTD';

    [boutiqueYtd, boutiqueLyYtd, boutiqueTargetYtd, zoneYtd, zoneLyYtd, zoneTargetYtd, boutiqueMonthly, zoneMonthly] =
      await Promise.all([
        sumSalesForBoutiquesDateRange([boutiqueId], ytdFrom, asOfDateKey),
        sumSalesForBoutiquesDateRange([boutiqueId], lyYtdFrom, lyAsOf),
        sumTargetsForBoutiquesMonths([boutiqueId], ytdMonthKeysList),
        sumSalesForBoutiquesDateRange(zoneBoutiqueIds, ytdFrom, asOfDateKey),
        sumSalesForBoutiquesDateRange(zoneBoutiqueIds, lyYtdFrom, lyAsOf),
        sumTargetsForBoutiquesMonths(zoneBoutiqueIds, ytdMonthKeysList),
        buildMonthlyChart([boutiqueId], year, parsed.m),
        buildMonthlyChart(zoneBoutiqueIds, year, parsed.m),
      ]);
  } else {
    comparisonLabel = `Boutique ${bounds.periodLabel}`;
    const comparisonTargetMonths =
      periodQuery.kind === 'year' && bounds.isInProgress
        ? chartMonthKeys
        : monthKeys;

    [boutiqueYtd, boutiqueLyYtd, boutiqueTargetYtd, zoneYtd, zoneLyYtd, zoneTargetYtd, boutiqueMonthly, zoneMonthly] =
      await Promise.all([
        mtdSales,
        sumSalesForBoutiquesDateRange([boutiqueId], lyFrom, lyTo),
        sumTargetsForBoutiquesMonths([boutiqueId], comparisonTargetMonths),
        sumSalesForBoutiquesDateRange(zoneBoutiqueIds, fromDateKey, toDateKey),
        sumSalesForBoutiquesDateRange(zoneBoutiqueIds, lyFrom, lyTo),
        sumTargetsForBoutiquesMonths(zoneBoutiqueIds, comparisonTargetMonths),
        buildMonthlyChartForMonths([boutiqueId], chartMonthKeys),
        buildMonthlyChartForMonths(zoneBoutiqueIds, chartMonthKeys),
      ]);
  }

  const boutiquePctOfTarget =
    boutiqueTargetYtd > 0 ? Math.round((boutiqueYtd * 100) / boutiqueTargetYtd) : null;
  const boutiqueVsLy = pctChange(boutiqueYtd, boutiqueLyYtd);
  const zonePctOfTarget = zoneTargetYtd > 0 ? Math.round((zoneYtd * 100) / zoneTargetYtd) : null;
  const zoneVsLy = pctChange(zoneYtd, zoneLyYtd);
  const boutiqueShareOfZonePct =
    zoneYtd > 0 ? Math.round((boutiqueYtd * 100) / zoneYtd) : null;

  return {
    meta: {
      boutiqueId,
      boutiqueName: boutique.name,
      boutiqueCode: boutique.code,
      regionName: boutique.region?.name ?? null,
      monthKey: anchorMonthKey,
      asOfDateKey,
      generatedAt: formatDateRiyadh(now),
      periodKind: periodQuery.kind,
      periodLabel: formatStoreReportPeriodLabel(periodQuery, 'en'),
      periodYear: periodQuery.year,
      periodMonth: periodQuery.month,
      periodQuarter: periodQuery.quarter,
      periodHalf: periodQuery.half,
      showClosingExpectation,
    },
    storeDetail: {
      kpis: {
        mtdSales,
        distributedTarget,
        budgetTarget,
        vsDistributedTargetPct: distributedPerf.percent,
        vsBudgetTargetPct: budgetPerf.percent,
        discountPct,
      },
      closingExpectation: {
        mtdPerformancePct: budgetPerf.percent,
        runRateRemainingMonth,
        pipelineDeals,
        projectedClosing,
        projectedAchievementPct,
        budgetTarget,
      },
      teamPerformance: [...teamRows, storeTotal],
      additionalKpis: {
        footfall: storeKpi?.footfall ?? null,
        conversionRate: storeKpi?.conversionRate ?? null,
        crmRegistrationRate: storeKpi?.crmRate ?? null,
      },
      teamHighlights: {
        topPerformer,
        laggingPerformer,
        employeesAboveTarget,
        discountWarning,
        discountTargetPct,
      },
    },
    ytdPerformance: {
      boutique: {
        revenueYtd: boutiqueYtd,
        vsLastYearPct: boutiqueVsLy,
        pctOfTarget: boutiquePctOfTarget,
        targetYtd: boutiqueTargetYtd,
        lastYearYtd: boutiqueLyYtd,
      },
      zone: {
        zoneName: boutique.region?.name ?? null,
        revenueYtd: zoneYtd,
        vsLastYearPct: zoneVsLy,
        pctOfTarget: zonePctOfTarget,
        targetYtd: zoneTargetYtd,
        lastYearYtd: zoneLyYtd,
        boutiqueShareOfZonePct,
      },
      charts: {
        boutiqueMonthly: boutiqueMonthly,
        zoneMonthly: zoneMonthly,
      },
      snapshot: {
        boutiqueText: buildSnapshotText({
          label: comparisonLabel,
          pctOfTarget: boutiquePctOfTarget,
          vsLastYearPct: boutiqueVsLy,
          shareOfZonePct: boutiqueShareOfZonePct,
        }),
        zoneText: buildSnapshotText({
          label: periodQuery.kind === 'month' ? 'Zone YTD' : `Zone ${bounds.periodLabel}`,
          pctOfTarget: zonePctOfTarget,
          vsLastYearPct: zoneVsLy,
        }),
      },
    },
  };
}
