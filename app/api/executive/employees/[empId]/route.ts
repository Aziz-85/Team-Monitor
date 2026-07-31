/**
 * GET /api/executive/employees/[empId]?year=YYYY&global=true — One employee annual. ADMIN + MANAGER only.
 * **CLASS A — canonical:** Aggregations use `groupSalesSumByMonthForUserInBoutiquesYear` /
 * `groupSalesSumByBoutiqueForUserYear` from `readSalesAggregate` (same SalesEntry semantics as metrics).
 * global=true: ADMIN only, all boutiques + audit. SAR integer only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  groupSalesSumByBoutiqueForUserYear,
  groupSalesSumByMonthForUserInBoutiquesYear,
} from '@/lib/sales/readSalesAggregate';
import { resolveExecutiveBoutiqueIds } from '@/lib/executive/scope';
import { requireExecutiveApiViewer } from '@/lib/executive/execAccess';

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sq = arr.map((x) => (x - mean) ** 2);
  return sq.reduce((a, b) => a + b, 0) / arr.length;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ empId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requireExecutiveApiViewer(request, user);
  if (!gate.ok) return gate.res;

  const globalParam = request.nextUrl.searchParams.get('global');
  const { boutiqueIds } = await resolveExecutiveBoutiqueIds(
    user.id,
    gate.effectiveRole,
    globalParam,
    'EXECUTIVE_EMPLOYEES',
    request,
    user
  );
  if (boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No boutiques in scope' }, { status: 403 });
  }

  const { empId } = await params;
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = yearParam && /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear());

  const employee = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true, name: true },
  });
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  const empUser = await prisma.user.findUnique({
    where: { empId },
    select: { id: true },
  });

  let total = 0;
  const byMonth = new Map<string, number>();
  let byBoutiqueArr: Array<{
    boutiqueId: string;
    boutiqueCode: string;
    boutiqueName: string;
    total: number;
  }> = [];

  if (empUser) {
    const [byMonthRows, byBoutiqueRows] = await Promise.all([
      groupSalesSumByMonthForUserInBoutiquesYear(empUser.id, year, boutiqueIds),
      groupSalesSumByBoutiqueForUserYear(empUser.id, year, boutiqueIds),
    ]);

    total = byMonthRows.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
    for (const r of byMonthRows) {
      if (r.month) byMonth.set(r.month, r._sum.amount ?? 0);
    }

    const boutiques = await prisma.boutique.findMany({
      where: { id: { in: byBoutiqueRows.map((row) => row.boutiqueId) } },
      select: { id: true, code: true, name: true },
    });
    const boutiqueMeta = new Map(boutiques.map((b) => [b.id, b]));

    byBoutiqueArr = byBoutiqueRows.map((r) => {
      const bid = r.boutiqueId;
      const meta = boutiqueMeta.get(bid);
      return {
        boutiqueId: bid,
        boutiqueCode: meta?.code ?? bid,
        boutiqueName: meta?.name ?? bid,
        total: r._sum.amount ?? 0,
      };
    });
  }

  const monthlySeries = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return byMonth.get(`${year}-${m}`) ?? 0;
  });
  const consistencyScore = monthlySeries.filter((x) => x > 0).length <= 1
    ? 100
    : Math.max(0, 100 - Math.round(Math.sqrt(variance(monthlySeries))));
  const monthAmounts = monthlySeries.map((amount, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, amount }));
  const sorted = [...monthAmounts].sort((a, b) => b.amount - a.amount);
  const topMonths = sorted.slice(0, 3);
  const bottomMonths = sorted.filter((m) => m.amount > 0).slice(-3).reverse();

  let achievementPct: number | null = null;
  let monthlyTargets = new Map<string, number>();
  let monthlyProductivity = new Map<string, { invoices: number; pieces: number }>();
  if (empUser) {
    const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const [targets, productivityRows] = await Promise.all([
      prisma.employeeMonthlyTarget.findMany({
        where: { userId: empUser.id, boutiqueId: { in: boutiqueIds }, month: { in: monthKeys } },
        select: { month: true, amount: true },
      }),
      prisma.salesEntry.groupBy({
        by: ['month'],
        where: { userId: empUser.id, boutiqueId: { in: boutiqueIds }, month: { in: monthKeys } },
        _sum: { invoiceCount: true, pieceCount: true },
      }),
    ]);
    monthlyTargets = new Map(targets.map((t) => [t.month, t.amount]));
    monthlyProductivity = new Map(productivityRows.map((r) => [r.month, {
      invoices: r._sum.invoiceCount ?? 0,
      pieces: r._sum.pieceCount ?? 0,
    }]));
    const annualTarget = targets.reduce((s, t) => s + t.amount, 0);
    if (annualTarget > 0) achievementPct = calculatePerformance({ target: annualTarget, sales: total }).percent;
  }

  const monthlyPerformance = monthAmounts.map(({ month, amount }) => {
    const target = monthlyTargets.get(month) ?? 0;
    const productivity = monthlyProductivity.get(month) ?? { invoices: 0, pieces: 0 };
    return {
      month,
      sales: amount,
      target,
      achievementPct: target > 0 ? calculatePerformance({ target, sales: amount }).percent : null,
      invoices: productivity.invoices,
      pieces: productivity.pieces,
      avt: productivity.invoices > 0 ? amount / productivity.invoices : null,
      avp: productivity.pieces > 0 ? amount / productivity.pieces : null,
      upt: productivity.invoices > 0 ? productivity.pieces / productivity.invoices : null,
    };
  });

  return NextResponse.json({
    year,
    empId: employee.empId,
    name: employee.name ?? employee.empId,
    annualTotal: total,
    byBoutique: byBoutiqueArr,
    monthlySeries,
    monthlyPerformance,
    consistencyScore,
    topMonths,
    bottomMonths,
    achievementPct,
  });
}
