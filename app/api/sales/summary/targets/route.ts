/**
 * GET /api/sales/summary/targets?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Boutique target overview: week, month, quarter, half-year, year with target/achieved/remaining and pct.
 * RBAC: MANAGER, ADMIN, SUPER_ADMIN only. All amounts SAR_INT; pct integer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { getWeekStart } from '@/lib/services/scheduleLock';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];
const SALES_ENTRY_SOURCES = ['LEDGER', 'IMPORT', 'MANUAL'];

type PeriodRow = {
  key: string;
  from?: string;
  to?: string;
  targetSar: number;
  achievedSar: number;
  remainingSar: number;
  pct: number;
  achievedPct?: number;
  remainingPct?: number;
};

function parseYmd(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

/** pct = (targetSar > 0) ? floor((achievedSar * 100) / targetSar) : 0 */
function computePct(achievedSar: number, targetSar: number): number {
  if (!Number.isFinite(targetSar) || targetSar <= 0) return 0;
  return Math.floor((Number(achievedSar) * 100) / targetSar);
}

/** remainingPct = 100 - min(pct, 100) for display */
function remainingPctDisplay(pct: number): number {
  return 100 - Math.min(pct, 100);
}

export async function GET(request: NextRequest) {
  const scopeResult = await getSalesScope({
    requestBoutiqueId: request.nextUrl.searchParams.get('boutiqueId')?.trim() || undefined,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;
  if (!ALLOWED_ROLES.includes(scope.role)) {
    return NextResponse.json({ error: 'Forbidden: MANAGER, ADMIN or SUPER_ADMIN only' }, { status: 403 });
  }
  const boutiqueId = scope.effectiveBoutiqueId;
  if (!boutiqueId) {
    return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  }

  const fromParam = request.nextUrl.searchParams.get('from')?.trim();
  const toParam = request.nextUrl.searchParams.get('to')?.trim();
  if (!fromParam || !toParam || !/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) required' }, { status: 400 });
  }

  const toDate = parseYmd(toParam);
  const year = toDate.getUTCFullYear();
  const monthKey = toParam.slice(0, 7);

  const weekStart = getWeekStart(toDate);
  const weekStartDate = parseYmd(weekStart);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  const monthEnd = new Date(Date.UTC(year, toDate.getUTCMonth() + 1, 0));
  const monthStart = new Date(Date.UTC(year, toDate.getUTCMonth(), 1));
  const quarter = Math.floor(toDate.getUTCMonth() / 3) + 1;
  const quarterKey = `${year}-Q${quarter}`;
  const quarterStartMonth = (quarter - 1) * 3 + 1;
  const quarterStart = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
  const quarterEndMonth = quarter * 3;
  const lastDayQ = new Date(Date.UTC(year, quarterEndMonth, 0));
  const quarterEnd = lastDayQ.toISOString().slice(0, 10);

  const half = toDate.getUTCMonth() < 6 ? 1 : 2;
  const halfKey = `${year}-H${half}`;
  const halfStart = half === 1 ? `${year}-01-01` : `${year}-07-01`;
  const halfEnd = half === 1 ? `${year}-06-30` : `${year}-12-31`;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const baseWhere = {
    boutiqueId,
    source: { in: SALES_ENTRY_SOURCES },
  };

  const [
    weekSales,
    monthSales,
    quarterSales,
    halfSales,
    yearSales,
    monthTarget,
    quarterTargets,
    halfTargets,
    yearTargets,
  ] = await Promise.all([
    prisma.salesEntry.aggregate({
      where: {
        ...baseWhere,
        date: { gte: weekStartDate, lte: weekEndDate },
      },
      _sum: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: {
        ...baseWhere,
        date: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: {
        ...baseWhere,
        date: { gte: parseYmd(quarterStart), lte: parseYmd(quarterEnd) },
      },
      _sum: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: {
        ...baseWhere,
        date: { gte: parseYmd(halfStart), lte: parseYmd(halfEnd) },
      },
      _sum: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: {
        ...baseWhere,
        date: { gte: parseYmd(yearStart), lte: parseYmd(yearEnd) },
      },
      _sum: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findUnique({
      where: { boutiqueId_month: { boutiqueId, month: monthKey } },
      select: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: {
        boutiqueId,
        month: {
          in: [
            `${year}-${String(quarterStartMonth).padStart(2, '0')}`,
            `${year}-${String(quarterStartMonth + 1).padStart(2, '0')}`,
            `${year}-${String(quarterStartMonth + 2).padStart(2, '0')}`,
          ],
        },
      },
      select: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: {
        boutiqueId,
        month: {
          in: half === 1
            ? [`${year}-01`, `${year}-02`, `${year}-03`, `${year}-04`, `${year}-05`, `${year}-06`]
            : [`${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`],
        },
      },
      select: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: {
        boutiqueId,
        month: { startsWith: String(year) },
      },
      select: { amount: true },
    }),
  ]);

  const daysInMonth = new Date(Date.UTC(year, toDate.getUTCMonth() + 1, 0)).getUTCDate();
  const monthTargetSar = monthTarget?.amount ?? 0;
  const weekTargetSar = monthTargetSar > 0 ? Math.round((monthTargetSar / daysInMonth) * 7) : 0;

  const weekAchieved = weekSales._sum.amount ?? 0;
  const monthAchieved = monthSales._sum.amount ?? 0;
  const quarterAchieved = quarterSales._sum.amount ?? 0;
  const halfAchieved = halfSales._sum.amount ?? 0;
  const yearAchieved = yearSales._sum.amount ?? 0;

  const quarterTargetSar = quarterTargets.reduce((s, t) => s + t.amount, 0);
  const halfTargetSar = halfTargets.reduce((s, t) => s + t.amount, 0);
  const yearTargetSar = yearTargets.reduce((s, t) => s + t.amount, 0);

  function row(
    key: string,
    targetSar: number,
    achievedSar: number,
    from?: string,
    to?: string
  ): PeriodRow {
    const remainingSar = targetSar - achievedSar;
    const pct = computePct(achievedSar, targetSar);
    return {
      key,
      ...(from && { from }),
      ...(to && { to }),
      targetSar,
      achievedSar,
      remainingSar,
      pct,
      achievedPct: pct,
      remainingPct: remainingPctDisplay(pct),
    };
  }

  return NextResponse.json({
    week: row(weekStart, weekTargetSar, weekAchieved, weekStart, weekEnd),
    month: row(monthKey, monthTargetSar, monthAchieved),
    quarter: row(quarterKey, quarterTargetSar, quarterAchieved),
    half: row(halfKey, halfTargetSar, halfAchieved),
    year: row(String(year), yearTargetSar, yearAchieved),
  });
}
