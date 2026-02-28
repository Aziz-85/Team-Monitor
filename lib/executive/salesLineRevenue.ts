/**
 * Executive revenue from Daily Sales Ledger (BoutiqueSalesLine).
 * Returns revenue by empId for date range and boutiqueIds (scope-aware).
 */

import { prisma } from '@/lib/db';

/**
 * Sum amountSar from BoutiqueSalesLine for summaries in date range and boutiqueIds.
 * Returns map empId -> total SAR.
 */
export async function getRevenueFromSalesLinesByEmpId(
  boutiqueIds: string[],
  dateFrom: Date,
  dateTo: Date
): Promise<Map<string, number>> {
  if (boutiqueIds.length === 0) return new Map();

  const lines = await prisma.boutiqueSalesLine.findMany({
    where: {
      summary: {
        boutiqueId: { in: boutiqueIds },
        date: { gte: dateFrom, lte: dateTo },
      },
    },
    select: { employeeId: true, amountSar: true },
  });

  const map = new Map<string, number>();
  for (const l of lines) {
    const current = map.get(l.employeeId) ?? 0;
    map.set(l.employeeId, current + l.amountSar);
  }
  return map;
}

/**
 * Convert revenue-by-empId to revenue-by-userId using User.empId.
 * Pass users with at least id and empId.
 */
export function revenueByEmpIdToByUserId(
  byEmpId: Map<string, number>,
  users: { id: string; empId: string }[]
): Map<string, number> {
  const byUserId = new Map<string, number>();
  for (const u of users) {
    const amount = byEmpId.get(u.empId) ?? 0;
    byUserId.set(u.id, amount);
  }
  return byUserId;
}
