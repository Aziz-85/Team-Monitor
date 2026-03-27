/**
 * Read-only company overview KPIs and summaries.
 */

import { prisma } from '@/lib/db';
import { aggregateSalesEntrySum } from '@/lib/sales/readSalesAggregate';
import { normalizeMonthKey } from '@/lib/time';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { computeForecast, computePaceMetrics } from '@/lib/analytics/performanceLayer';
import type { CompanyMonthContext } from '@/lib/company/companyMonthContext';
import { buildCompanyBranchComparison } from '@/lib/company/buildCompanyBranchComparison';
import type { CompanyAlertItem, CompanyBranchRow, CompanyOverviewPayload } from '@/lib/company/types';

export type { CompanyOverviewPayload } from '@/lib/company/types';

export async function buildCompanyOverview(
  boutiqueIds: string[],
  ctx: CompanyMonthContext,
  options: {
    alertsPreview: CompanyAlertItem[];
    branchRows?: CompanyBranchRow[];
  }
): Promise<CompanyOverviewPayload> {
  const branchRows =
    options.branchRows ?? (await buildCompanyBranchComparison(boutiqueIds, ctx));

  const [targetRows, mtdTotal, employeeCount, salesByUser] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findMany({
      where: { month: normalizeMonthKey(ctx.monthKey), boutiqueId: { in: boutiqueIds } },
      select: { amount: true },
    }),
    aggregateSalesEntrySum(ctx.mtdSalesWhereBase(boutiqueIds)),
    prisma.employee.count({
      where: {
        boutiqueId: { in: boutiqueIds },
        active: true,
        isSystemOnly: false,
      },
    }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where: ctx.mtdSalesWhereBase(boutiqueIds),
      _sum: { amount: true },
    }),
  ]);

  const networkTargetMtd = targetRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const networkActualMtd = mtdTotal;
  const perf = calculatePerformance({ target: networkTargetMtd, sales: networkActualMtd });
  const pace = computePaceMetrics({
    actualMTD: networkActualMtd,
    monthlyTarget: networkTargetMtd,
    totalDaysInMonth: ctx.daysInMonth,
    daysPassed: ctx.daysPassed,
  });
  const forecast = computeForecast({
    actualMTD: networkActualMtd,
    monthlyTarget: networkTargetMtd,
    totalDaysInMonth: ctx.daysInMonth,
    daysPassed: ctx.daysPassed,
  });

  const sorted = [...branchRows].sort(
    (a, b) => (b.achievementPct ?? -1) - (a.achievementPct ?? -1)
  );
  const topBranches = sorted.slice(0, 3).filter((r) => (r.achievementPct ?? 0) > 0);
  const bottomBranches = [...branchRows]
    .sort((a, b) => (a.achievementPct ?? 999) - (b.achievementPct ?? 999))
    .slice(0, 3);

  const userAmounts = salesByUser
    .map((r) => ({
      userId: r.userId,
      amount: r._sum.amount ?? 0,
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  let employeeHighlights: CompanyOverviewPayload['employeeHighlights'] = [];
  if (userAmounts.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userAmounts.map((u) => u.userId) } },
      select: {
        id: true,
        empId: true,
        employee: {
          select: {
            name: true,
            nameAr: true,
            boutique: { select: { code: true } },
          },
        },
      },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));
    employeeHighlights = userAmounts
      .map((u) => {
        const row = uMap.get(u.userId);
        if (!row) return null;
        return {
          userId: row.id,
          empId: row.empId,
          name: row.employee?.name ?? row.empId,
          nameAr: row.employee?.nameAr ?? null,
          boutiqueCode: row.employee?.boutique?.code ?? '—',
          actualMtd: u.amount,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }

  return {
    monthKey: ctx.monthKey,
    daysInMonth: ctx.daysInMonth,
    daysPassed: ctx.daysPassed,
    networkActualMtd,
    networkTargetMtd,
    networkRemaining: perf.remaining,
    paceBand: pace.band,
    paceDelta: pace.paceDelta,
    forecastEom: forecast.forecastedTotal,
    forecastDelta: forecast.forecastDelta,
    activeBoutiqueCount: boutiqueIds.length,
    activeEmployeeCount: employeeCount,
    branchSummaries: branchRows,
    topBranches,
    bottomBranches,
    alertsPreview: options.alertsPreview.slice(0, 8),
    employeeHighlights,
  };
}
