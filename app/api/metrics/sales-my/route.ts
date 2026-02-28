/**
 * GET /api/metrics/sales-my?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Canonical sales metrics for /sales/my. Uses resolveMetricsScope + getSalesMetrics.
 * Default: from = start of current month (Riyadh), to = today (Riyadh).
 * When employee: also returns monthlyBreakdown (target, actual, pct per month) and cumulative.
 */

import { NextRequest, NextResponse } from 'next/server';
import { addDays, toRiyadhDateOnly } from '@/lib/time';
import { getRiyadhNow, formatMonthKey } from '@/lib/time';
import { parseIsoDateOrThrow, formatIsoDate } from '@/lib/time/parse';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getSalesMetrics } from '@/lib/metrics/aggregator';
import { prisma } from '@/lib/db';

const SAR_TO_HALALAS = 100;
function salesEntrySarToHalalas(sar: number): number {
  return Math.round(Number(sar) * SAR_TO_HALALAS);
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope for metrics' }, { status: 403 });
  }

  const fromParam = request.nextUrl.searchParams.get('from')?.trim();
  const toParam = request.nextUrl.searchParams.get('to')?.trim();
  let fromDate: Date;
  let toDate: Date;

  const nowRiyadh = getRiyadhNow();
  const todayRiyadh = toRiyadhDateOnly(nowRiyadh);
  const startOfCurrentMonth = new Date(Date.UTC(nowRiyadh.getUTCFullYear(), nowRiyadh.getUTCMonth(), 1, 0, 0, 0, 0));

  if (fromParam && toParam) {
    try {
      fromDate = parseIsoDateOrThrow(fromParam);
      toDate = parseIsoDateOrThrow(toParam);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid date';
      return NextResponse.json({ error: `from and to must be YYYY-MM-DD. ${message}` }, { status: 400 });
    }
    if (fromDate.getTime() > toDate.getTime()) [fromDate, toDate] = [toDate, fromDate];
    fromDate = toRiyadhDateOnly(fromDate);
    toDate = toRiyadhDateOnly(toDate);
  } else {
    fromDate = toRiyadhDateOnly(startOfCurrentMonth);
    toDate = todayRiyadh;
    if (fromDate.getTime() > toDate.getTime()) fromDate = toDate;
  }

  const toExclusive = addDays(toDate, 1);

  const metrics = await getSalesMetrics({
    boutiqueId: scope.effectiveBoutiqueId,
    userId: scope.employeeOnly ? scope.userId : null,
    from: fromDate,
    toExclusive,
  });

  const breakdownByEmployee: Array<{
    employeeId: string;
    employeeName: string;
    netSales: number;
    guestCoverageNetSales: number;
  }> = [];
  let monthlyBreakdown: Array<{
    monthKey: string;
    monthLabel: string;
    target: number;
    actual: number;
    pct: number;
    cumulativeTarget: number;
    cumulativeActual: number;
  }> = [];

  if (scope.employeeOnly && scope.empId) {
    const u = await prisma.user.findUnique({
      where: { id: scope.userId },
      select: { employee: { select: { name: true } }, empId: true },
    });
    breakdownByEmployee.push({
      employeeId: scope.empId,
      employeeName: u?.employee?.name ?? u?.empId ?? scope.empId ?? '',
      netSales: metrics.netSalesTotal,
      guestCoverageNetSales: 0,
    });

    const currentMonthKey = formatMonthKey(nowRiyadh);
    const year = currentMonthKey.slice(0, 4);
    const monthKeys: string[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      monthKeys.push(key);
      if (key === currentMonthKey) break;
    }

    const [targets, salesByMonth] = await Promise.all([
      prisma.employeeMonthlyTarget.findMany({
        where: {
          boutiqueId: scope.effectiveBoutiqueId,
          userId: scope.userId,
          month: { in: monthKeys },
        },
        select: { month: true, amount: true },
      }),
      prisma.salesEntry.groupBy({
        by: ['month'],
        where: {
          boutiqueId: scope.effectiveBoutiqueId,
          userId: scope.userId,
          month: { in: monthKeys },
          source: { in: ['LEDGER', 'IMPORT', 'MANUAL'] },
        },
        _sum: { amount: true },
      }),
    ]);

    const targetByMonth = new Map(targets.map((t) => [t.month, t.amount]));
    const actualByMonth = new Map(salesByMonth.map((r) => [r.month, r._sum.amount ?? 0]));

    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let cumTarget = 0;
    let cumActual = 0;
    monthlyBreakdown = monthKeys.map((monthKey) => {
      const targetSar = targetByMonth.get(monthKey) ?? 0;
      const target = Math.round(targetSar * SAR_TO_HALALAS);
      const actual = salesEntrySarToHalalas(actualByMonth.get(monthKey) ?? 0);
      const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
      cumTarget += target;
      cumActual += actual;
      const [, mStr] = monthKey.split('-');
      const monthLabel = MONTH_NAMES[Number(mStr) - 1] ?? monthKey;
      return {
        monthKey,
        monthLabel: `${monthLabel} ${year}`,
        target,
        actual,
        pct,
        cumulativeTarget: cumTarget,
        cumulativeActual: cumActual,
      };
    });
  }

  return NextResponse.json({
    from: formatIsoDate(fromDate),
    to: formatIsoDate(toDate),
    netSalesTotal: metrics.netSalesTotal,
    grossSalesTotal: metrics.netSalesTotal,
    returnsTotal: 0,
    exchangesTotal: 0,
    guestCoverageNetSales: 0,
    entriesCount: metrics.entriesCount,
    byDateKey: metrics.byDateKey,
    breakdownByEmployee,
    monthlyBreakdown,
  });
}
