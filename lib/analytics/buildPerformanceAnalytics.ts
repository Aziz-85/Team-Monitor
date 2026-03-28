/**
 * Server-only: aggregates SalesEntry + boutique/employee targets for analytics payloads.
 * Read-only; does not alter SalesEntry or target allocation rules.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  addDays,
  formatMonthKey,
  getDaysInMonth,
  getRiyadhNow,
  normalizeMonthKey,
  toRiyadhDateString,
} from '@/lib/time';
import {
  computeForecast,
  computeForecastRolling7,
  computePaceMetrics,
  computeProductivityMetrics,
  paceDaysPassedForMonth,
} from '@/lib/analytics/performanceLayer';

export type PerformanceAnalyticsEmployeeRow = {
  userId: string;
  empId: string | null;
  name: string;
  monthlyTarget: number;
  totalSalesMTD: number;
  activeDays: number;
  avgDailySales: number;
  salesPerActiveDay: number;
  contributionPct: number;
  pace: ReturnType<typeof computePaceMetrics>;
  forecast: ReturnType<typeof computeForecast>;
};

export type PerformanceAnalyticsPayload = {
  monthKey: string;
  todayStr: string;
  daysInMonth: number;
  daysPassed: number;
  boutique: {
    monthlyTarget: number;
    actualMTD: number;
    remaining: number;
    pace: ReturnType<typeof computePaceMetrics>;
    forecast: ReturnType<typeof computeForecast>;
    forecastRolling7: ReturnType<typeof computeForecastRolling7> | null;
  };
  employees: PerformanceAnalyticsEmployeeRow[];
};

function dateKeyFromUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildMtdWhere(
  boutiqueIds: string[],
  monthKey: string,
  todayStr: string,
  todayMonthKey: string
): Prisma.SalesEntryWhereInput {
  const base: Prisma.SalesEntryWhereInput = {
    month: normalizeMonthKey(monthKey),
    boutiqueId: { in: boutiqueIds },
  };
  const sel = normalizeMonthKey(monthKey);
  if (sel > todayMonthKey) {
    return { ...base, id: { in: [] } };
  }
  if (sel === todayMonthKey) {
    return { ...base, dateKey: { lte: todayStr } };
  }
  return base;
}

function resolveDaysPassedWithAccounting(
  monthKey: string,
  todayStr: string,
  todayMonthKey: string,
  daysInMonth: number,
  hasSalesEntryForToday: boolean
): number {
  const sel = normalizeMonthKey(monthKey);
  if (sel < todayMonthKey) return Math.max(0, daysInMonth);
  if (sel > todayMonthKey) return 1;
  const day = new Date(todayStr + 'T00:00:00.000Z').getUTCDate();
  return paceDaysPassedForMonth(day, daysInMonth, hasSalesEntryForToday);
}

export async function buildPerformanceAnalytics(input: {
  boutiqueIds: string[];
  monthKey?: string;
  userIdFilter?: string | null;
  includeEmployees?: boolean;
}): Promise<PerformanceAnalyticsPayload | null> {
  const boutiqueIds = input.boutiqueIds.filter(Boolean);
  if (boutiqueIds.length === 0) return null;

  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const todayMonthKey = formatMonthKey(now);
  const monthKey = normalizeMonthKey(
    input.monthKey?.trim() || todayMonthKey
  );
  const daysInMonth = getDaysInMonth(monthKey);
  const mtdWhere = buildMtdWhere(boutiqueIds, monthKey, todayStr, todayMonthKey);
  const selNorm = normalizeMonthKey(monthKey);
  let hasSalesEntryForToday = false;
  if (selNorm === todayMonthKey && boutiqueIds.length > 0) {
    hasSalesEntryForToday =
      (await prisma.salesEntry.count({
        where: {
          month: selNorm,
          boutiqueId: { in: boutiqueIds },
          dateKey: todayStr,
        },
      })) > 0;
  }
  const daysPassed = resolveDaysPassedWithAccounting(
    monthKey,
    todayStr,
    todayMonthKey,
    daysInMonth,
    hasSalesEntryForToday
  );

  const includeEmployees = input.includeEmployees !== false;
  const needUserBreakdown = includeEmployees || Boolean(input.userIdFilter);
  const userDayWhere: Prisma.SalesEntryWhereInput = input.userIdFilter
    ? { ...mtdWhere, userId: input.userIdFilter }
    : mtdWhere;

  const [targetRows, actualMTD, perUserDay] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findMany({
      where: { month: monthKey, boutiqueId: { in: boutiqueIds } },
      select: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: mtdWhere,
      _sum: { amount: true },
    }),
    needUserBreakdown
      ? prisma.salesEntry.groupBy({
          by: ['userId', 'dateKey'],
          where: userDayWhere,
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const monthlyTarget = targetRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const boutiqueMtd = actualMTD._sum.amount ?? 0;
  const remaining = Math.max(0, monthlyTarget - boutiqueMtd);

  const pace = computePaceMetrics({
    actualMTD: boutiqueMtd,
    monthlyTarget,
    totalDaysInMonth: daysInMonth,
    daysPassed,
  });
  const forecast = computeForecast({
    actualMTD: boutiqueMtd,
    monthlyTarget,
    totalDaysInMonth: daysInMonth,
    daysPassed,
  });

  let forecastRolling7: ReturnType<typeof computeForecastRolling7> | null = null;
  if (normalizeMonthKey(monthKey) === todayMonthKey) {
    const cap = new Date(todayStr + 'T00:00:00.000Z');
    const keys7: string[] = [];
    for (let i = 6; i >= 0; i--) {
      keys7.push(dateKeyFromUtcDate(addDays(cap, -i)));
    }
    const dayRows =
      keys7.length > 0
        ? await prisma.salesEntry.groupBy({
            by: ['dateKey'],
            where: {
              month: normalizeMonthKey(monthKey),
              boutiqueId: { in: boutiqueIds },
              dateKey: { in: keys7 },
            },
            _sum: { amount: true },
          })
        : [];
    const byKey = new Map(
      dayRows.map((r) => [r.dateKey, r._sum.amount ?? 0])
    );
    const totals = keys7.map((k) => byKey.get(k) ?? 0);
    forecastRolling7 = computeForecastRolling7({
      lastSevenDayTotals: totals,
      totalDaysInMonth: daysInMonth,
      monthlyTarget,
    });
  }

  const byUser = new Map<string, { total: number; activeDays: number }>();
  for (const row of perUserDay) {
    const uid = row.userId;
    if (!uid) continue;
    const amt = row._sum.amount ?? 0;
    const cur = byUser.get(uid) ?? { total: 0, activeDays: 0 };
    cur.total += amt;
    if (amt > 0) cur.activeDays += 1;
    byUser.set(uid, cur);
  }

  let userIds = Array.from(byUser.keys());
  if (input.userIdFilter) {
    userIds = userIds.filter((id) => id === input.userIdFilter);
  }

  const targetByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const empTgtRows = await prisma.employeeMonthlyTarget.findMany({
      where: {
        month: monthKey,
        boutiqueId: { in: boutiqueIds },
        userId: { in: userIds },
      },
      select: { userId: true, amount: true },
    });
    for (const er of empTgtRows) {
      const cur = targetByUser.get(er.userId) ?? 0;
      targetByUser.set(er.userId, cur + (er.amount ?? 0));
    }
  }

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

  const employees: PerformanceAnalyticsEmployeeRow[] = userIds
    .map((userId) => {
      const agg = byUser.get(userId);
      if (!agg) return null;
      const u = userMap.get(userId);
      const name = u?.employee?.name ?? u?.empId ?? userId;
      const empMonthlyTarget = targetByUser.get(userId) ?? 0;
      const prod = computeProductivityMetrics({
        totalSalesMTD: agg.total,
        activeDays: agg.activeDays,
        boutiqueMTD: boutiqueMtd,
      });
      const empPace = computePaceMetrics({
        actualMTD: agg.total,
        monthlyTarget: empMonthlyTarget,
        totalDaysInMonth: daysInMonth,
        daysPassed,
      });
      const empForecast = computeForecast({
        actualMTD: agg.total,
        monthlyTarget: empMonthlyTarget,
        totalDaysInMonth: daysInMonth,
        daysPassed,
      });
      return {
        monthlyTarget: empMonthlyTarget,
        userId,
        empId: u?.empId ?? null,
        name,
        totalSalesMTD: prod.totalSalesMTD,
        activeDays: prod.activeDays,
        avgDailySales: prod.avgDailySales,
        salesPerActiveDay: prod.salesPerActiveDay,
        contributionPct: prod.contributionPct,
        pace: empPace,
        forecast: empForecast,
      };
    })
    .filter((x): x is PerformanceAnalyticsEmployeeRow => x != null)
    .sort((a, b) => b.totalSalesMTD - a.totalSalesMTD);

  if (input.userIdFilter && employees.length === 0) {
    const uid = input.userIdFilter;
    const u = await prisma.user.findFirst({
      where: { id: uid },
      select: { id: true, empId: true, employee: { select: { name: true } } },
    });
    if (u) {
      const empTgtRows = await prisma.employeeMonthlyTarget.findMany({
        where: {
          month: monthKey,
          boutiqueId: { in: boutiqueIds },
          userId: uid,
        },
        select: { amount: true },
      });
      const empMonthlyTarget = empTgtRows.reduce((s, r) => s + (r.amount ?? 0), 0);
      const prod = computeProductivityMetrics({
        totalSalesMTD: 0,
        activeDays: 0,
        boutiqueMTD: boutiqueMtd,
      });
      employees.push({
        monthlyTarget: empMonthlyTarget,
        userId: uid,
        empId: u.empId,
        name: u.employee?.name ?? u.empId ?? uid,
        totalSalesMTD: prod.totalSalesMTD,
        activeDays: prod.activeDays,
        avgDailySales: prod.avgDailySales,
        salesPerActiveDay: prod.salesPerActiveDay,
        contributionPct: 0,
        pace: computePaceMetrics({
          actualMTD: 0,
          monthlyTarget: empMonthlyTarget,
          totalDaysInMonth: daysInMonth,
          daysPassed,
        }),
        forecast: computeForecast({
          actualMTD: 0,
          monthlyTarget: empMonthlyTarget,
          totalDaysInMonth: daysInMonth,
          daysPassed,
        }),
      });
    }
  }

  return {
    monthKey,
    todayStr,
    daysInMonth,
    daysPassed,
    boutique: {
      monthlyTarget,
      actualMTD: boutiqueMtd,
      remaining,
      pace,
      forecast,
      forecastRolling7,
    },
    employees,
  };
}
