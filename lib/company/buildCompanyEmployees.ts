/**
 * Read-only company roster: sales MTD, employee target, pace, productivity (where safe).
 */

import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import {
  computePaceMetrics,
  computeProductivityMetrics,
} from '@/lib/analytics/performanceLayer';
import type { CompanyMonthContext } from '@/lib/company/companyMonthContext';
import { buildCompanyBranchComparison } from '@/lib/company/buildCompanyBranchComparison';
import type { CompanyEmployeeRow } from '@/lib/company/types';

export async function buildCompanyEmployees(
  boutiqueIds: string[],
  ctx: CompanyMonthContext
): Promise<CompanyEmployeeRow[]> {
  if (boutiqueIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      boutiqueId: { in: boutiqueIds },
      disabled: false,
      employee: { active: true, isSystemOnly: false },
    },
    select: {
      id: true,
      empId: true,
      role: true,
      boutiqueId: true,
      employee: {
        select: {
          name: true,
          nameAr: true,
          boutique: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { employee: { name: 'asc' } },
  });

  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return [];

  const monthKey = normalizeMonthKey(ctx.monthKey);

  const [salesByUser, targets, dayBuckets, branchRows] = await Promise.all([
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where: ctx.mtdSalesWhereBase(boutiqueIds),
      _sum: { amount: true },
    }),
    prisma.employeeMonthlyTarget.findMany({
      where: {
        month: monthKey,
        boutiqueId: { in: boutiqueIds },
        userId: { in: userIds },
      },
      select: { userId: true, boutiqueId: true, amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['userId', 'dateKey'],
      where: {
        ...ctx.mtdSalesWhereBase(boutiqueIds),
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    }),
    buildCompanyBranchComparison(boutiqueIds, ctx),
  ]);

  const salesMap = new Map(salesByUser.map((s) => [s.userId, s._sum.amount ?? 0]));
  const targetMap = new Map(
    targets.map((t) => [`${t.userId}:${t.boutiqueId}`, t.amount])
  );
  const boutiqueMtdMap = new Map(branchRows.map((r) => [r.boutiqueId, r.actualMtd]));

  const activeDaysMap = new Map<string, number>();
  for (const d of dayBuckets) {
    if ((d._sum.amount ?? 0) <= 0) continue;
    activeDaysMap.set(d.userId, (activeDaysMap.get(d.userId) ?? 0) + 1);
  }

  return users.map((u) => {
    const emp = u.employee;
    const boutiqueCode = emp?.boutique?.code ?? '—';
    const boutiqueName = emp?.boutique?.name ?? '—';
    const actualMtd = salesMap.get(u.id) ?? 0;
    const targetAmt = targetMap.get(`${u.id}:${u.boutiqueId}`);
    const targetMtd = targetAmt !== undefined ? targetAmt : null;
    const monthTarget = targetMtd ?? 0;
    const pace = computePaceMetrics({
      actualMTD: actualMtd,
      monthlyTarget: monthTarget,
      totalDaysInMonth: ctx.daysInMonth,
      daysPassed: ctx.daysPassed,
    });
    const achievementPct =
      monthTarget > 0
        ? calculatePerformance({ target: monthTarget, sales: actualMtd }).percent
        : null;
    const bMtd = boutiqueMtdMap.get(u.boutiqueId) ?? 0;
    const activeDays = activeDaysMap.get(u.id) ?? 0;
    const productivity =
      bMtd > 0 && actualMtd > 0
        ? computeProductivityMetrics({
            totalSalesMTD: actualMtd,
            activeDays,
            boutiqueMTD: bMtd,
          })
        : null;

    return {
      userId: u.id,
      empId: u.empId,
      name: emp?.name ?? u.empId,
      nameAr: emp?.nameAr ?? null,
      boutiqueId: u.boutiqueId,
      boutiqueCode,
      boutiqueName,
      role: u.role,
      actualMtd,
      targetMtd,
      achievementPct,
      paceBand: pace.band,
      paceDelta: pace.paceDelta,
      productivity,
    };
  });
}
