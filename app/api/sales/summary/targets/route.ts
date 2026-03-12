/**
 * GET /api/sales/summary/targets?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Boutique target overview: week, month, quarter, half-year, year with target/achieved/remaining and pct.
 * Targets follow BoutiqueMonthlyTarget aggregation:
 * - Week: SUM(dailyTarget per day in week) via getDailyTargetForDay
 * - Month: BoutiqueMonthlyTarget.amount
 * - Quarter/Half/Year: SUM(month targets in period)
 * RBAC: MANAGER, ADMIN, SUPER_ADMIN only. All amounts SAR_INT; pct via calculatePerformance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';
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

  const monthTargetSar = monthTarget?.amount ?? 0;
  const quarterTargetSar = quarterTargets.reduce((s, t) => s + t.amount, 0);
  const halfTargetSar = halfTargets.reduce((s, t) => s + t.amount, 0);
  const yearTargetSar = yearTargets.reduce((s, t) => s + t.amount, 0);

  // Week target: SUM(dailyTarget for each day in week). Week may span two months.
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate);
    d.setUTCDate(d.getUTCDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const monthKeysInWeek = Array.from(new Set(weekDates.map((d) => d.slice(0, 7))));
  const monthTargetsInWeek = await prisma.boutiqueMonthlyTarget.findMany({
    where: { boutiqueId, month: { in: monthKeysInWeek } },
    select: { month: true, amount: true },
  });
  const monthTargetMap = new Map(monthTargetsInWeek.map((t) => [t.month, t.amount]));
  let weekTargetSar = 0;
  for (const dateStr of weekDates) {
    const monthKey = dateStr.slice(0, 7);
    const mt = monthTargetMap.get(monthKey) ?? 0;
    const daysInMonth = new Date(Date.UTC(parseInt(monthKey.slice(0, 4), 10), parseInt(monthKey.slice(5, 7), 10), 0)).getUTCDate();
    const dayOfMonth = parseInt(dateStr.slice(8, 10), 10);
    weekTargetSar += getDailyTargetForDay(mt, daysInMonth, dayOfMonth);
  }

  const weekAchieved = weekSales._sum.amount ?? 0;
  const monthAchieved = monthSales._sum.amount ?? 0;
  const quarterAchieved = quarterSales._sum.amount ?? 0;
  const halfAchieved = halfSales._sum.amount ?? 0;
  const yearAchieved = yearSales._sum.amount ?? 0;

  // Daily trajectory for Target vs Actual chart (month of to, MTD cumulative)
  const daysInMonth = new Date(Date.UTC(year, toDate.getUTCMonth() + 1, 0)).getUTCDate();
  const todayDayOfMonth = Math.min(toDate.getUTCDate(), daysInMonth);
  const salesByDate = await prisma.salesEntry.groupBy({
    by: ['dateKey'],
    where: {
      ...baseWhere,
      date: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });
  const salesByDateKey = new Map(salesByDate.map((r) => [r.dateKey, r._sum?.amount ?? 0]));
  let cumTarget = 0;
  let cumActual = 0;
  const dailyTrajectory: { dateKey: string; targetCumulative: number; actualCumulative: number }[] = [];
  const mm = String(toDate.getUTCMonth() + 1).padStart(2, '0');
  for (let d = 1; d <= todayDayOfMonth; d++) {
    const dateKey = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    cumTarget += getDailyTargetForDay(monthTargetSar, daysInMonth, d);
    cumActual += salesByDateKey.get(dateKey) ?? 0;
    dailyTrajectory.push({ dateKey, targetCumulative: cumTarget, actualCumulative: cumActual });
  }

  function row(
    key: string,
    targetSar: number,
    achievedSar: number,
    from?: string,
    to?: string
  ): PeriodRow {
    const perf = calculatePerformance({ target: targetSar, sales: achievedSar });
    return {
      key,
      ...(from && { from }),
      ...(to && { to }),
      targetSar: perf.target,
      achievedSar: perf.sales,
      remainingSar: perf.remaining,
      pct: perf.percent,
      achievedPct: perf.percent,
      remainingPct: 100 - Math.min(perf.percent, 100),
    };
  }

  return NextResponse.json({
    week: row(weekStart, weekTargetSar, weekAchieved, weekStart, weekEnd),
    month: row(monthKey, monthTargetSar, monthAchieved),
    quarter: row(quarterKey, quarterTargetSar, quarterAchieved),
    half: row(halfKey, halfTargetSar, halfAchieved),
    year: row(String(year), yearTargetSar, yearAchieved),
    dailyTrajectory,
    monthKey,
  });
}
