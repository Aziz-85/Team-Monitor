/**
 * Lightweight parity evaluation over canonical SalesEntry helpers.
 * Used by tests and `parityDiagnostics` / admin diagnostics — not a separate truth source.
 *
 * **Does not compare SalesEntry to ledger:** under Policy A (`lib/sales/reconciliationPolicy.ts`),
 * historical HISTORICAL_IMPORT rows may exist only in SalesEntry — ledger parity is out of scope here.
 */

import { prisma } from '@/lib/db';
import {
  aggregateSalesEntrySum,
  groupSalesByUserForBoutiqueMonth,
  salesEntryWhereForBoutiqueMonth,
  salesEntryWhereForBoutiqueMonths,
  salesEntryWhereForUserMonth,
} from '@/lib/sales/readSalesAggregate';
import { getTargetMetrics, getDashboardSalesMetrics } from '@/lib/metrics/aggregator';
import { getRiyadhNow, getMonthRange, normalizeMonthKey, toRiyadhDateString } from '@/lib/time';

export type ParityStatus = 'PASS' | 'FAIL';

export type ParityCheckResult = {
  contractName: string;
  status: ParityStatus;
  delta: number;
  context: Record<string, string | number | boolean | undefined>;
  values: Record<string, number>;
  message?: string;
};

function result(
  contractName: string,
  a: number,
  b: number,
  context: ParityCheckResult['context'],
  labels: [string, string]
): ParityCheckResult {
  const delta = Math.abs(a - b);
  return {
    contractName,
    status: delta === 0 ? 'PASS' : 'FAIL',
    delta,
    context,
    values: { [labels[0]]: a, [labels[1]]: b },
  };
}

/** Invariant: aggregate sum === sum of per-user groupBy for same boutique month (all sources). */
export async function evaluateBoutiqueMonthAggregateVsGroupBy(
  boutiqueId: string,
  monthKey: string
): Promise<ParityCheckResult> {
  const mk = normalizeMonthKey(monthKey);
  const aggregateTotal = await aggregateSalesEntrySum(salesEntryWhereForBoutiqueMonth(boutiqueId, mk));
  const groups = await groupSalesByUserForBoutiqueMonth(boutiqueId, mk);
  const groupBySum = groups.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  return result(
    'BoutiqueMonth_AggregateEqualsGroupBySum',
    aggregateTotal,
    groupBySum,
    { boutiqueId, monthKey: mk },
    ['aggregateTotal', 'groupBySum']
  );
}

/** Full month total vs getDashboardSalesMetrics (boutique view, not employee-only). */
export async function evaluateBoutiqueMonthVsDashboardActual(
  boutiqueId: string,
  monthKey: string
): Promise<ParityCheckResult> {
  const mk = normalizeMonthKey(monthKey);
  const aggregateTotal = await aggregateSalesEntrySum(salesEntryWhereForBoutiqueMonth(boutiqueId, mk));
  const dash = await getDashboardSalesMetrics({
    boutiqueId,
    monthKey: mk,
    employeeOnly: false,
  });
  const r = result(
    'BoutiqueMonth_AggregateEqualsDashboardActual',
    aggregateTotal,
    dash.currentMonthActual,
    { boutiqueId, monthKey: mk },
    ['aggregateTotal', 'dashboardCurrentMonthActual']
  );
  if (r.status === 'FAIL') {
    r.message =
      'Full-month SalesEntry sum should match dashboard currentMonthActual for boutique scope.';
  }
  return r;
}

/** MTD sales: direct aggregate vs getTargetMetrics (must match scope flags). */
export async function evaluateEmployeeMtdVsTargetMetrics(input: {
  boutiqueId: string;
  userId: string;
  monthKey: string;
  employeeCrossBoutique?: boolean;
}): Promise<ParityCheckResult> {
  const mk = normalizeMonthKey(input.monthKey);
  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const where = salesEntryWhereForUserMonth(
    input.userId,
    mk,
    input.employeeCrossBoutique ? null : input.boutiqueId
  );
  const mtdDirect = await aggregateSalesEntrySum({ ...where, dateKey: { lte: todayStr } });
  const tm = await getTargetMetrics({
    boutiqueId: input.boutiqueId,
    userId: input.userId,
    monthKey: mk,
    employeeCrossBoutique: input.employeeCrossBoutique,
  });
  const r = result(
    'EmployeeMtd_EqualsGetTargetMetrics',
    mtdDirect,
    tm.mtdSales,
    {
      boutiqueId: input.boutiqueId,
      userId: input.userId,
      monthKey: mk,
      employeeCrossBoutique: !!input.employeeCrossBoutique,
      todayStr,
    },
    ['aggregateMtd', 'getTargetMetricsMtdSales']
  );
  if (r.status === 'FAIL') {
    r.message = 'MTD must match getTargetMetrics when scope flags align.';
  }
  return r;
}

/**
 * Matrix (single month, no previous month): sum of entry amounts with empId vs aggregate for ALL sources.
 * If FAIL, check orphan SalesEntry rows (user without empId).
 */
export async function evaluateMatrixScopeVsAggregate(
  boutiqueId: string,
  monthKey: string,
  ledgerOnly: boolean
): Promise<ParityCheckResult> {
  const mk = normalizeMonthKey(monthKey);
  const where = salesEntryWhereForBoutiqueMonths(boutiqueId, [mk], ledgerOnly);
  const aggregateTotal = await aggregateSalesEntrySum(where);
  const rows = await prisma.salesEntry.findMany({
    where,
    select: { amount: true, user: { select: { empId: true } } },
  });
  const matrixLikeSum = rows.reduce((s, e) => s + (e.user?.empId ? e.amount : 0), 0);
  const r = result(
    'MatrixScopeGrandTotal_EqualsAggregate',
    matrixLikeSum,
    aggregateTotal,
    { boutiqueId, monthKey: mk, ledgerOnly },
    ['sumWithEmpId', 'aggregateAllRows']
  );
  if (r.status === 'FAIL' && !ledgerOnly) {
    r.message =
      'Matrix-implied sum (rows with empId) is below full aggregate — possible rows without empId.';
  }
  return r;
}

/**
 * `SalesEntry.month` column vs `date` in [monthStart, monthEnd) — must match for consistent data.
 * Used by `/api/target/boutique/daily` (month column) vs range-based queries.
 */
export async function evaluateBoutiqueMonthColumnVsDateRange(
  boutiqueId: string,
  monthKey: string
): Promise<ParityCheckResult> {
  const mk = normalizeMonthKey(monthKey);
  const { start, endExclusive } = getMonthRange(mk);
  const byMonthCol = await aggregateSalesEntrySum(salesEntryWhereForBoutiqueMonth(boutiqueId, mk));
  const byDateRange = await aggregateSalesEntrySum({
    boutiqueId,
    date: { gte: start, lt: endExclusive },
  });
  const r = result(
    'BoutiqueMonth_ColumnEqualsDateRange',
    byMonthCol,
    byDateRange,
    { boutiqueId, monthKey: mk },
    ['sumByMonthColumn', 'sumByDateRange']
  );
  if (r.status === 'FAIL') {
    r.message = 'SalesEntry.month must align with date for this boutique (data integrity).';
  }
  return r;
}

export async function runCoreParitySuite(input: {
  boutiqueId: string;
  monthKey: string;
  userId?: string;
  employeeCrossBoutique?: boolean;
}): Promise<ParityCheckResult[]> {
  const { boutiqueId, monthKey } = input;
  const out: ParityCheckResult[] = [
    await evaluateBoutiqueMonthAggregateVsGroupBy(boutiqueId, monthKey),
    await evaluateBoutiqueMonthVsDashboardActual(boutiqueId, monthKey),
    await evaluateBoutiqueMonthColumnVsDateRange(boutiqueId, monthKey),
    await evaluateMatrixScopeVsAggregate(boutiqueId, monthKey, false),
    await evaluateMatrixScopeVsAggregate(boutiqueId, monthKey, true),
  ];
  if (input.userId) {
    out.push(
      await evaluateEmployeeMtdVsTargetMetrics({
        boutiqueId,
        userId: input.userId,
        monthKey,
        employeeCrossBoutique: input.employeeCrossBoutique,
      })
    );
  }
  return out;
}
