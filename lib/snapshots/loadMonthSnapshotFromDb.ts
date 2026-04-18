/**
 * Server-only. Build executive month snapshot from live SalesEntry (canonical), same JSON shape as Excel snapshot.
 */

import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';
import { salesEntryWhereForBoutiqueMonth } from '@/lib/sales/readSalesAggregate';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import type { MonthSnapshot, MonthSnapshotDay, MonthSnapshotStaffRow } from './loadMonthSnapshotFromExcel';

export type LoadMonthSnapshotDbInput = {
  boutiqueId: string;
  /** Boutique `code` for response parity with Excel snapshots. */
  branchCode: string;
  month: string;
};

export async function loadMonthSnapshotFromDb(
  input: LoadMonthSnapshotDbInput
): Promise<MonthSnapshot | null> {
  const month = normalizeMonthKey(input.month);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const { boutiqueId, branchCode } = input;
  const where = salesEntryWhereForBoutiqueMonth(boutiqueId, month);

  const [dailyRows, staffRows, targetRows] = await Promise.all([
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.employeeMonthlyTarget.findMany({
      where: { boutiqueId, month },
      select: { userId: true, amount: true },
    }),
  ]);

  const daily: MonthSnapshotDay[] = dailyRows
    .map((r) => ({
      date: r.dateKey,
      netSalesHalalas: (r._sum.amount ?? 0) * 100,
      invoices: r._count.id,
      pieces: 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const userIds = staffRows.map((r) => r.userId);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, empId: true, employee: { select: { name: true } } },
        })
      : [];

  const userMeta = new Map<string, { empId: string; name: string }>();
  for (const u of users) {
    userMeta.set(u.id, {
      empId: u.empId,
      name: u.employee?.name?.trim() || u.empId || u.id.slice(0, 8),
    });
  }

  const targetByUser = new Map(targetRows.map((t) => [t.userId, t.amount]));

  const staff: MonthSnapshotStaffRow[] = staffRows.map((r) => {
    const amountSar = r._sum.amount ?? 0;
    const targetSar = targetByUser.get(r.userId) ?? 0;
    const perf = calculatePerformance({ target: targetSar, sales: amountSar });
    const meta = userMeta.get(r.userId);
    return {
      empId: meta?.empId,
      name: meta?.name ?? r.userId.slice(0, 8),
      netSalesHalalas: amountSar * 100,
      invoices: r._count.id,
      pieces: 0,
      achievementPct: targetSar > 0 ? perf.percent : undefined,
    };
  });

  return {
    month,
    branchCode,
    daily,
    staff,
  };
}
