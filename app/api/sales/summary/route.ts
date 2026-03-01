/**
 * GET /api/sales/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&boutiqueId= (optional, ADMIN only)
 * Source of truth: SalesEntry (LEDGER, IMPORT, MANUAL). Strict boutique scoping.
 * All amounts SAR_INT (integer riyals). Branch totals by SalesEntry.boutiqueId; employee totals by SalesEntry.userId across all boutiques.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { parseDateRiyadh, formatDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';

const DEFAULT_DAYS = 31;
const SALES_ENTRY_SOURCES = ['LEDGER', 'IMPORT', 'MANUAL'];

export async function GET(request: NextRequest) {
  const boutiqueIdParam = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const scopeResult = await getSalesScope({
    requestBoutiqueId: boutiqueIdParam || undefined,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  const fromParam = request.nextUrl.searchParams.get('from')?.trim();
  const toParam = request.nextUrl.searchParams.get('to')?.trim();
  const from = parseDateRiyadh(fromParam || '');
  const to = parseDateRiyadh(toParam || '');
  let fromDate = from;
  let toDate = to;
  if (!fromParam || !toParam) {
    const end = toDate.getTime() >= fromDate.getTime() ? toDate : fromDate;
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - DEFAULT_DAYS);
    fromDate = start;
    toDate = end;
  }
  if (fromDate.getTime() > toDate.getTime()) {
    [fromDate, toDate] = [toDate, fromDate];
  }

  const whereBase: {
    boutiqueId?: string;
    userId?: string;
    date: { gte: Date; lte: Date };
    source: { in: string[] };
  } = {
    date: { gte: fromDate, lte: toDate },
    source: { in: SALES_ENTRY_SOURCES },
  };

  if (scope.employeeOnly) {
    whereBase.userId = scope.userId;
    // Do not add boutiqueId: employee sees total across ALL boutiques.
  } else if (scope.allowedBoutiqueIds.length > 0) {
    whereBase.boutiqueId = scope.effectiveBoutiqueId;
  }

  const [aggregateResult, groupByResult] = await Promise.all([
    prisma.salesEntry.aggregate({
      where: whereBase,
      _sum: { amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where: whereBase,
      _sum: { amount: true },
    }),
  ]);

  const rawNetSales = aggregateResult._sum.amount ?? 0;
  const netSalesTotal = rawNetSales;
  const grossSalesTotal = rawNetSales;
  const returnsTotal = 0;
  const exchangesTotal = 0;
  const guestCoverageNetSales = 0;

  const userIds = groupByResult.map((r) => r.userId);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            empId: true,
            employee: { select: { name: true } },
          },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const breakdownByEmployee = groupByResult.map((row) => {
    const u = userMap.get(row.userId);
    const employeeName = u?.employee?.name ?? u?.empId ?? row.userId;
    return {
      employeeId: u?.empId ?? row.userId,
      employeeName,
      netSales: row._sum.amount ?? 0,
      guestCoverageNetSales: 0,
      guestCoverageSources: [] as Array<{ sourceBoutiqueId: string; sourceBoutiqueName?: string; netSales: number }>,
    };
  });

  return NextResponse.json({
    from: formatDateRiyadh(fromDate),
    to: formatDateRiyadh(toDate),
    netSalesTotal,
    grossSalesTotal,
    returnsTotal,
    exchangesTotal,
    guestCoverageNetSales,
    breakdownByEmployee,
  });
}
