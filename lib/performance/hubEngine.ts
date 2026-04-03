/**
 * Performance Hub — orchestrates SalesEntry + reporting targets for scoped boutiques/employees.
 * SAR integers only; achievement via calculatePerformance. No duplicated pace/forecast logic.
 */

import { prisma } from '@/lib/db';
import { aggregateSalesEntrySum } from '@/lib/sales/readSalesAggregate';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { addDays, addMonths, getDaysInMonth, normalizeMonthKey, toRiyadhDateString } from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';
import type { HubPeriodKind } from '@/lib/performance/hubPeriods';
import { chartBucketsForPeriod, resolvePeriodWindow } from '@/lib/performance/hubPeriods';
import {
  sumBoutiqueReportingTargetForRange,
  sumEmployeeReportingTargetForRange,
} from '@/lib/performance/hubTargets';
import type { PerformanceHubCompareMode, PerformanceHubContext } from '@/lib/performance/hubScope';

export type HubSeriesPoint = { label: string; actualSales: number; targetSales: number; achievementPct: number };

export type HubEntitySummary = {
  id: string;
  label: string;
  actualSales: number;
  targetSales: number;
  achievementPct: number;
  gapSales: number;
  series: HubSeriesPoint[];
};

export type HubBestsBlock = {
  bestDaySales: { value: number; label: string };
  bestWeekSales: { value: number; label: string };
  bestMonthSales: { value: number; label: string };
  bestQuarterSales: { value: number; label: string };
  bestHalfSales: { value: number; label: string };
  bestYearSales: { value: number; label: string };
  bestDayAchievementPct: { value: number; label: string };
  bestWeekAchievementPct: { value: number; label: string };
  bestMonthAchievementPct: { value: number; label: string };
  bestQuarterAchievementPct: { value: number; label: string };
  bestHalfAchievementPct: { value: number; label: string };
  bestYearAchievementPct: { value: number; label: string };
  highestSalesValue: number;
  highestAchievementPct: number;
};

export type HubEmployeeRow = {
  userId: string;
  empId: string;
  name: string;
  actualSales: number;
  targetSales: number;
  achievementPct: number;
  gapSales: number;
  bestPeriodLabel: string;
};

export type PerformanceHubPayload = {
  period: HubPeriodKind;
  anchorDateKey: string;
  windowLabel: string;
  compareMode: PerformanceHubCompareMode;
  entity: 'boutique' | 'employees';
  /** KPI strip — first entity or combined. */
  summary: {
    actualSales: number;
    targetSales: number;
    achievementPct: number;
    gapSales: number;
    bestPeriodLabel: string;
    bestPerformerLabel: string | null;
  };
  entities: HubEntitySummary[];
  bests: HubBestsBlock | null;
  employees: HubEmployeeRow[];
};

async function salesForRangeBoutiques(
  boutiqueIds: string[],
  from: Date,
  toExclusive: Date
): Promise<number> {
  if (boutiqueIds.length === 0) return 0;
  return aggregateSalesEntrySum({
    boutiqueId: boutiqueIds.length === 1 ? boutiqueIds[0] : { in: boutiqueIds },
    date: { gte: from, lt: toExclusive },
  });
}

async function targetForRangeBoutiques(
  boutiqueIds: string[],
  from: Date,
  toExclusive: Date
): Promise<number> {
  let t = 0;
  for (const id of boutiqueIds) {
    t += await sumBoutiqueReportingTargetForRange(id, from, toExclusive);
  }
  return t;
}

async function buildEntitySeries(
  label: string,
  id: string,
  boutiqueIds: string[],
  buckets: { label: string; from: Date; toExclusive: Date }[],
  windowFrom: Date,
  windowToExclusive: Date
): Promise<HubEntitySummary> {
  const series: HubSeriesPoint[] = [];
  for (const b of buckets) {
    const a = await salesForRangeBoutiques(boutiqueIds, b.from, b.toExclusive);
    const tgt = await targetForRangeBoutiques(boutiqueIds, b.from, b.toExclusive);
    const p = calculatePerformance({ target: tgt, sales: a });
    series.push({
      label: b.label,
      actualSales: a,
      targetSales: tgt,
      achievementPct: p.percent,
    });
  }
  const actualSales = await salesForRangeBoutiques(boutiqueIds, windowFrom, windowToExclusive);
  const targetSales = await targetForRangeBoutiques(boutiqueIds, windowFrom, windowToExclusive);
  const perf = calculatePerformance({ target: targetSales, sales: actualSales });
  return {
    id,
    label,
    actualSales,
    targetSales,
    achievementPct: perf.percent,
    gapSales: perf.remaining,
    series,
  };
}

/** Saturday-aligned week label from start date. */
function weekLabelFromStart(startSat: Date): string {
  const end = addDays(startSat, 6);
  return `${toRiyadhDateString(startSat)} – ${toRiyadhDateString(end)}`;
}

/**
 * Scan historical buckets for “best” insights (rolling window ending anchor year).
 * Uses calendar months for month/quarter/half/year; Sat-weeks for weeks; days for days.
 */
async function computeBoutiqueBests(boutiqueId: string, anchorDateKey: string): Promise<HubBestsBlock> {
  const anchorYear = Number(anchorDateKey.slice(0, 4));
  const fromMonth = `${Math.max(2000, anchorYear - 2)}-01`;
  const toMonth = `${anchorYear}-12`;

  const [monthlySales, monthlyTargets, dailyRows] = await Promise.all([
    prisma.salesEntry.groupBy({
      by: ['month'],
      where: { boutiqueId, month: { gte: fromMonth, lte: toMonth } },
      _sum: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: { boutiqueId, month: { gte: fromMonth, lte: toMonth } },
      select: { month: true, amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: {
        boutiqueId,
        dateKey: { gte: `${anchorYear}-01-01`, lte: `${anchorYear}-12-31` },
      },
      _sum: { amount: true },
    }),
  ]);

  const salesByMonth = new Map(monthlySales.map((r) => [normalizeMonthKey(r.month), r._sum.amount ?? 0]));
  const targetByMonth = new Map(monthlyTargets.map((r) => [normalizeMonthKey(r.month), r.amount]));

  let bestMonthSales = { value: 0, label: '—' };
  let bestMonthPct = { value: 0, label: '—' };
  let mk = fromMonth;
  while (mk <= toMonth) {
    const n = normalizeMonthKey(mk);
    const s = salesByMonth.get(n) ?? 0;
    const t = targetByMonth.get(n) ?? 0;
    const pct = calculatePerformance({ target: t, sales: s }).percent;
    if (s > bestMonthSales.value) bestMonthSales = { value: s, label: n };
    if (pct > bestMonthPct.value && t > 0) bestMonthPct = { value: pct, label: n };
    mk = addMonths(mk, 1);
  }

  /* Quarters / halves / years from monthly maps */
  let bestQSales = { value: 0, label: '—' };
  let bestQPct = { value: 0, label: '—' };
  let bestHSales = { value: 0, label: '—' };
  let bestHPct = { value: 0, label: '—' };
  let bestYSales = { value: 0, label: '—' };
  let bestYPct = { value: 0, label: '—' };

  for (let y = anchorYear - 2; y <= anchorYear; y++) {
    for (let q = 1; q <= 4; q++) {
      const startM = (q - 1) * 3 + 1;
      const start = `${y}-${String(startM).padStart(2, '0')}`;
      let ts = 0;
      let tt = 0;
      for (let i = 0; i < 3; i++) {
        const k = normalizeMonthKey(addMonths(start, i));
        ts += salesByMonth.get(k) ?? 0;
        tt += targetByMonth.get(k) ?? 0;
      }
      const lab = `${y} Q${q}`;
      if (ts > bestQSales.value) bestQSales = { value: ts, label: lab };
      const qp = calculatePerformance({ target: tt, sales: ts }).percent;
      if (qp > bestQPct.value && tt > 0) bestQPct = { value: qp, label: lab };
    }
    for (const half of [1, 2] as const) {
      const start = half === 1 ? `${y}-01` : `${y}-07`;
      let ts = 0;
      let tt = 0;
      for (let i = 0; i < 6; i++) {
        const k = normalizeMonthKey(addMonths(start, i));
        ts += salesByMonth.get(k) ?? 0;
        tt += targetByMonth.get(k) ?? 0;
      }
      const lab = `${y} H${half}`;
      if (ts > bestHSales.value) bestHSales = { value: ts, label: lab };
      const hp = calculatePerformance({ target: tt, sales: ts }).percent;
      if (hp > bestHPct.value && tt > 0) bestHPct = { value: hp, label: lab };
    }
    let ys = 0;
    let yt = 0;
    for (let m = 1; m <= 12; m++) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      ys += salesByMonth.get(k) ?? 0;
      yt += targetByMonth.get(k) ?? 0;
    }
    const ylab = String(y);
    if (ys > bestYSales.value) bestYSales = { value: ys, label: ylab };
    const yp = calculatePerformance({ target: yt, sales: ys }).percent;
    if (yp > bestYPct.value && yt > 0) bestYPct = { value: yp, label: ylab };
  }

  /* Days in anchor year */
  let bestDaySales = { value: 0, label: '—' };
  let bestDayPct = { value: 0, label: '—' };
  for (const r of dailyRows) {
    const dk = r.dateKey;
    const s = r._sum.amount ?? 0;
    const mk2 = normalizeMonthKey(dk.slice(0, 7));
    const mt = targetByMonth.get(mk2) ?? 0;
    const dim = getDaysInMonth(mk2);
    const dom = Number(dk.slice(8, 10));
    const dayT = getDailyTargetForDay(mt, dim, dom);
    const dp = calculatePerformance({ target: dayT, sales: s }).percent;
    if (s > bestDaySales.value) bestDaySales = { value: s, label: dk };
    if (dp > bestDayPct.value && dayT > 0) bestDayPct = { value: dp, label: dk };
  }

  /* Weeks: group daily into Sat-start weeks in anchor year */
  const byWeek = new Map<string, { s: number; t: number }>();
  for (const r of dailyRows) {
    const d = new Date(r.dateKey + 'T12:00:00.000Z');
    const dow = d.getUTCDay();
    const daysToSat = (dow - 6 + 7) % 7;
    const sat = addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)), -daysToSat);
    const wk = toRiyadhDateString(sat);
    const mk2 = normalizeMonthKey(r.dateKey.slice(0, 7));
    const mt = targetByMonth.get(mk2) ?? 0;
    const dim = getDaysInMonth(mk2);
    const dom = Number(r.dateKey.slice(8, 10));
    const dayT = getDailyTargetForDay(mt, dim, dom);
    const cur = byWeek.get(wk) ?? { s: 0, t: 0 };
    cur.s += r._sum.amount ?? 0;
    cur.t += dayT;
    byWeek.set(wk, cur);
  }
  let bestWeekSales = { value: 0, label: '—' };
  let bestWeekPct = { value: 0, label: '—' };
  for (const [wk, v] of Array.from(byWeek.entries())) {
    if (v.s > bestWeekSales.value) bestWeekSales = { value: v.s, label: weekLabelFromStart(new Date(wk + 'T00:00:00.000Z')) };
    const wp = calculatePerformance({ target: v.t, sales: v.s }).percent;
    if (wp > bestWeekPct.value && v.t > 0)
      bestWeekPct = { value: wp, label: weekLabelFromStart(new Date(wk + 'T00:00:00.000Z')) };
  }

  const highSales = Math.max(
    bestDaySales.value,
    bestWeekSales.value,
    bestMonthSales.value,
    bestQSales.value,
    bestHSales.value,
    bestYSales.value
  );
  const highPct = Math.max(
    bestDayPct.value,
    bestWeekPct.value,
    bestMonthPct.value,
    bestQPct.value,
    bestHPct.value,
    bestYPct.value
  );

  return {
    bestDaySales,
    bestWeekSales,
    bestMonthSales: bestMonthSales,
    bestQuarterSales: bestQSales,
    bestHalfSales: bestHSales,
    bestYearSales: bestYSales,
    bestDayAchievementPct: bestDayPct,
    bestWeekAchievementPct: bestWeekPct,
    bestMonthAchievementPct: bestMonthPct,
    bestQuarterAchievementPct: bestQPct,
    bestHalfAchievementPct: bestHPct,
    bestYearAchievementPct: bestYPct,
    highestSalesValue: highSales,
    highestAchievementPct: highPct,
  };
}

export async function buildPerformanceHubPayload(input: {
  ctx: PerformanceHubContext;
  entity: 'boutique' | 'employees';
  period: HubPeriodKind;
  anchorDateKey: string;
  compareMode: PerformanceHubCompareMode;
  boutiqueIds: string[];
  regionIds: string[];
  employeeUserId: string | null;
}): Promise<PerformanceHubPayload> {
  const { ctx, entity, period, anchorDateKey, compareMode } = input;
  let boutiqueIds = input.boutiqueIds.filter((id) => ctx.allowedBoutiqueIds.includes(id));
  if (boutiqueIds.length === 0) boutiqueIds = [...ctx.defaultBoutiqueIds];

  const window = resolvePeriodWindow(period, anchorDateKey);
  const buckets = chartBucketsForPeriod(window);

  const entities: HubEntitySummary[] = [];

  if (entity === 'boutique') {
    if (compareMode === 'regions' && ctx.canCompareRegions && input.regionIds.length > 0) {
      const allowedRegion = new Set(ctx.regions.map((r) => r.id));
      const rids = input.regionIds.filter((id) => allowedRegion.has(id));
      for (const rid of rids) {
        const inRegion = ctx.boutiques.filter((b) => b.regionId === rid).map((b) => b.id);
        if (inRegion.length === 0) continue;
        const reg = ctx.regions.find((r) => r.id === rid);
        entities.push(
          await buildEntitySeries(
            reg?.name ?? rid,
            rid,
            inRegion,
            buckets,
            window.from,
            window.toExclusive
          )
        );
      }
      if (entities.length === 0) {
        const b = ctx.boutiques.find((x) => x.id === boutiqueIds[0]);
        entities.push(
          await buildEntitySeries(
            b ? `${b.name} (${b.code})` : boutiqueIds[0],
            boutiqueIds[0],
            boutiqueIds,
            buckets,
            window.from,
            window.toExclusive
          )
        );
      }
    } else if (compareMode === 'boutiques' && ctx.canCompareBoutiques && boutiqueIds.length > 1) {
      for (const bid of boutiqueIds) {
        const b = ctx.boutiques.find((x) => x.id === bid);
        entities.push(
          await buildEntitySeries(
            b ? `${b.name} (${b.code})` : bid,
            bid,
            [bid],
            buckets,
            window.from,
            window.toExclusive
          )
        );
      }
    } else {
      const b = ctx.boutiques.find((x) => x.id === boutiqueIds[0]);
      entities.push(
        await buildEntitySeries(
          b ? `${b.name} (${b.code})` : boutiqueIds[0],
          boutiqueIds[0],
          boutiqueIds,
          buckets,
          window.from,
          window.toExclusive
        )
      );
    }
  }

  /* Employee mode */
  const employees: HubEmployeeRow[] = [];
  if (entity === 'employees') {
    const scopeBoutiques = compareMode === 'boutiques' && boutiqueIds.length > 1 ? boutiqueIds : [boutiqueIds[0]];
    const users = await prisma.user.findMany({
      where: {
        boutiqueId: scopeBoutiques.length === 1 ? scopeBoutiques[0] : { in: scopeBoutiques },
        disabled: false,
        role: { in: ['EMPLOYEE', 'ASSISTANT_MANAGER'] },
        employee: { isNot: null },
      },
      select: {
        id: true,
        empId: true,
        boutiqueId: true,
        employee: { select: { name: true } },
      },
      orderBy: { empId: 'asc' },
    });
    const filtered = input.employeeUserId
      ? users.filter((u) => u.id === input.employeeUserId)
      : users;

    for (const u of filtered) {
      const a = await aggregateSalesEntrySum({
        userId: u.id,
        boutiqueId: u.boutiqueId,
        date: { gte: window.from, lt: window.toExclusive },
      });
      const tgt = await sumEmployeeReportingTargetForRange(u.boutiqueId, u.id, window.from, window.toExclusive);
      const perf = calculatePerformance({ target: tgt, sales: a });
      employees.push({
        userId: u.id,
        empId: u.empId,
        name: u.employee?.name ?? u.empId,
        actualSales: a,
        targetSales: tgt,
        achievementPct: perf.percent,
        gapSales: perf.remaining,
        bestPeriodLabel: window.label,
      });
    }
    employees.sort((x, y) => y.actualSales - x.actualSales);
  }

  const sumActualEnt = entities.reduce((s, e) => s + e.actualSales, 0);
  const sumTargetEnt = entities.reduce((s, e) => s + e.targetSales, 0);
  const sumActualEmp = employees.reduce((s, e) => s + e.actualSales, 0);
  const sumTargetEmp = employees.reduce((s, e) => s + e.targetSales, 0);

  const useEmployees = entity === 'employees';
  const sumActual = useEmployees ? sumActualEmp : sumActualEnt;
  const sumTarget = useEmployees ? sumTargetEmp : sumTargetEnt;
  const agg = calculatePerformance({ target: sumTarget, sales: sumActual });

  let bests: HubBestsBlock | null = null;
  const singleBoutiqueBests =
    entity === 'boutique' &&
    compareMode !== 'regions' &&
    entities.length === 1 &&
    boutiqueIds.length === 1;
  if (singleBoutiqueBests) {
    bests = await computeBoutiqueBests(boutiqueIds[0], anchorDateKey);
  }

  const topEmp = employees[0];
  const bestPerformer =
    entity === 'employees' && topEmp
      ? `${topEmp.name} (${topEmp.empId})`
      : entities.length > 1
        ? entities.reduce((a, b) => (b.actualSales > a.actualSales ? b : a)).label
        : null;

  return {
    period,
    anchorDateKey,
    windowLabel: window.label,
    compareMode,
    entity,
    summary: {
      actualSales: agg.sales,
      targetSales: agg.target,
      achievementPct: agg.percent,
      gapSales: agg.remaining,
      bestPeriodLabel: window.label,
      bestPerformerLabel: bestPerformer,
    },
    entities,
    bests,
    employees,
  };
}
