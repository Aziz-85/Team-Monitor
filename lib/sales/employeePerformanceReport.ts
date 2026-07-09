/**
 * Employee sales performance report with boutique breakdown and cross-boutique warnings.
 */

import { prisma } from '@/lib/db';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { getMonthRange, normalizeMonthKey } from '@/lib/time';

export type EmployeeBoutiqueBreakdown = {
  boutiqueId: string;
  boutiqueName: string;
  salesAmount: number;
  percentageOfEmployeeTotal: number;
};

export type EmployeePerformanceRow = {
  employeeId: string;
  employeeName: string;
  userId: string;
  targetAmount: number;
  achievedAmount: number;
  achievementPct: number;
  boutiqueBreakdown: EmployeeBoutiqueBreakdown[];
  warnings: string[];
};

function monthKeysBetween(fromDateKey: string, toDateKey: string): string[] {
  const start = normalizeMonthKey(fromDateKey.slice(0, 7));
  const end = normalizeMonthKey(toDateKey.slice(0, 7));
  const out: string[] = [];
  let [y, m] = start.split('-').map((x) => parseInt(x, 10));
  const [ey, em] = end.split('-').map((x) => parseInt(x, 10));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export async function buildEmployeePerformanceReport(input: {
  fromDateKey: string;
  toDateKey: string;
  boutiqueIds: string[];
}): Promise<EmployeePerformanceRow[]> {
  const { fromDateKey, toDateKey, boutiqueIds } = input;
  if (boutiqueIds.length === 0) return [];

  const scopedSales = await prisma.salesEntry.findMany({
    where: {
      boutiqueId: { in: boutiqueIds },
      dateKey: { gte: fromDateKey, lte: toDateKey },
    },
    select: { userId: true },
  });
  const userIds = Array.from(new Set(scopedSales.map((r) => r.userId)));
  if (userIds.length === 0) return [];

  const salesRows = await prisma.salesEntry.findMany({
    where: {
      userId: { in: userIds },
      dateKey: { gte: fromDateKey, lte: toDateKey },
    },
    select: {
      userId: true,
      boutiqueId: true,
      dateKey: true,
      amount: true,
      user: {
        select: {
          empId: true,
          employee: { select: { name: true } },
        },
      },
    },
  });

  const boutiqueIdsInSales = Array.from(new Set(salesRows.map((r) => r.boutiqueId)));
  const boutiques = await prisma.boutique.findMany({
    where: { id: { in: boutiqueIdsInSales } },
    select: { id: true, name: true },
  });
  const boutiqueNameById = new Map(boutiques.map((b) => [b.id, b.name]));

  const monthKeys = monthKeysBetween(fromDateKey, toDateKey);
  const targetRows = await prisma.employeeMonthlyTarget.findMany({
    where: {
      boutiqueId: { in: boutiqueIds },
      month: { in: monthKeys },
    },
    select: { userId: true, amount: true },
  });

  const targetByUser = new Map<string, number>();
  for (const row of targetRows) {
    targetByUser.set(row.userId, (targetByUser.get(row.userId) ?? 0) + row.amount);
  }

  type Acc = {
    userId: string;
    empId: string;
    employeeName: string;
    total: number;
    byBoutique: Map<string, { name: string; amount: number }>;
    byDateBoutiques: Map<string, Set<string>>;
  };

  const byUser = new Map<string, Acc>();

  for (const row of salesRows) {
    const empId = row.user.empId ?? row.userId;
    const name = row.user.employee?.name ?? empId;
    let acc = byUser.get(row.userId);
    if (!acc) {
      acc = {
        userId: row.userId,
        empId,
        employeeName: name,
        total: 0,
        byBoutique: new Map(),
        byDateBoutiques: new Map(),
      };
      byUser.set(row.userId, acc);
    }
    acc.total += row.amount;
    const b = acc.byBoutique.get(row.boutiqueId) ?? {
      name: boutiqueNameById.get(row.boutiqueId) ?? row.boutiqueId,
      amount: 0,
    };
    b.amount += row.amount;
    acc.byBoutique.set(row.boutiqueId, b);

    const dateSet = acc.byDateBoutiques.get(row.dateKey) ?? new Set<string>();
    dateSet.add(row.boutiqueId);
    acc.byDateBoutiques.set(row.dateKey, dateSet);
  }

  const results: EmployeePerformanceRow[] = [];

  for (const acc of Array.from(byUser.values())) {
    const targetAmount = targetByUser.get(acc.userId) ?? 0;
    const perf = calculatePerformance({ target: targetAmount, sales: acc.total });
    const breakdown: EmployeeBoutiqueBreakdown[] = Array.from(acc.byBoutique.entries()).map(
      ([boutiqueId, v]) => ({
        boutiqueId,
        boutiqueName: v.name,
        salesAmount: v.amount,
        percentageOfEmployeeTotal:
          acc.total > 0 ? Math.round((v.amount * 100) / acc.total) : 0,
      })
    );
    breakdown.sort((a, b) => b.salesAmount - a.salesAmount);

    const warnings: string[] = [];
    for (const [dateKey, boutiques] of Array.from(acc.byDateBoutiques.entries())) {
      if (boutiques.size > 1) {
        warnings.push(
          `Employee has sales in ${boutiques.size} boutiques on ${dateKey}; review cross-boutique imports.`
        );
      }
    }

    results.push({
      employeeId: acc.empId,
      employeeName: acc.employeeName,
      userId: acc.userId,
      targetAmount,
      achievedAmount: acc.total,
      achievementPct: perf.percent,
      boutiqueBreakdown: breakdown,
      warnings,
    });
  }

  results.sort((a, b) => b.achievedAmount - a.achievedAmount);
  return results;
}

export function dateRangeForMonth(monthKey: string): { from: string; to: string } {
  const { start, endExclusive } = getMonthRange(monthKey);
  const lastDay = new Date(endExclusive.getTime() - 86400000);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, '0');
  const d = String(lastDay.getUTCDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}
