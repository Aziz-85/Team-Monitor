/**
 * Read-only: per-boutique MTD sales, targets, pace, forecast for company scope.
 */

import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { computeForecast, computePaceMetrics } from '@/lib/analytics/performanceLayer';
import type { CompanyMonthContext } from '@/lib/company/companyMonthContext';
import type { CompanyBranchRow } from '@/lib/company/types';

export type { CompanyBranchRow } from '@/lib/company/types';

/**
 * `alertCount` is filled by buildCompanyAlerts; pass 0 initially or merge after.
 */
export async function buildCompanyBranchComparison(
  boutiqueIds: string[],
  ctx: CompanyMonthContext
): Promise<CompanyBranchRow[]> {
  if (boutiqueIds.length === 0) return [];

  const [boutiques, targets, salesMtdRows, empCounts] = await Promise.all([
    prisma.boutique.findMany({
      where: { id: { in: boutiqueIds }, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: { month: normalizeMonthKey(ctx.monthKey), boutiqueId: { in: boutiqueIds } },
      select: { boutiqueId: true, amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['boutiqueId'],
      where: ctx.mtdSalesWhereBase(boutiqueIds),
      _sum: { amount: true },
    }),
    prisma.employee.groupBy({
      by: ['boutiqueId'],
      where: {
        boutiqueId: { in: boutiqueIds },
        active: true,
        isSystemOnly: false,
      },
      _count: { empId: true },
    }),
  ]);

  const revenueMap = new Map<string, number>();
  for (const r of salesMtdRows) {
    if (r.boutiqueId) revenueMap.set(r.boutiqueId, r._sum.amount ?? 0);
  }
  const targetMap = new Map<string, number>();
  for (const t of targets) {
    if (t.boutiqueId) targetMap.set(t.boutiqueId, t.amount);
  }
  const empCountMap = new Map<string, number>();
  for (const e of empCounts) {
    if (e.boutiqueId) empCountMap.set(e.boutiqueId, e._count.empId);
  }

  const rows: CompanyBranchRow[] = [];
  for (const b of boutiques) {
    const actualMtd = revenueMap.get(b.id) ?? 0;
    const targetMtd = targetMap.get(b.id) ?? 0;
    const perf =
      targetMtd > 0
        ? calculatePerformance({ target: targetMtd, sales: actualMtd })
        : { remaining: 0, percent: 0 };
    const remaining = perf.remaining;
    const achievementPct = targetMtd > 0 ? perf.percent : null;

    const pace = computePaceMetrics({
      actualMTD: actualMtd,
      monthlyTarget: targetMtd,
      totalDaysInMonth: ctx.daysInMonth,
      daysPassed: ctx.daysPassed,
    });
    const forecast = computeForecast({
      actualMTD: actualMtd,
      monthlyTarget: targetMtd,
      totalDaysInMonth: ctx.daysInMonth,
      daysPassed: ctx.daysPassed,
    });

    rows.push({
      boutiqueId: b.id,
      code: b.code,
      name: b.name,
      actualMtd,
      targetMtd,
      remaining,
      achievementPct,
      paceBand: pace.band,
      paceDelta: pace.paceDelta,
      forecastEom: forecast.forecastedTotal,
      forecastDelta: forecast.forecastDelta,
      employeeCount: empCountMap.get(b.id) ?? 0,
      alertCount: 0,
    });
  }

  return rows;
}
