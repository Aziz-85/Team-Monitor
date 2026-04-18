/**
 * Server-only YoY loader from live SalesEntry for a boutique + calendar month (Riyadh month key).
 * Same map shape as Excel YoY loader; read-only.
 */

import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';
import { salesEntryWhereForBoutiqueMonth } from '@/lib/sales/readSalesAggregate';
import type { YoYDayRow } from '@/lib/yoy/loadYoYFromExcel';

export async function loadYoYFromDb(input: {
  boutiqueId: string;
  month: string;
}): Promise<Map<string, YoYDayRow> | null> {
  const mk = normalizeMonthKey(input.month);
  if (!/^\d{4}-\d{2}$/.test(mk)) return null;

  const rows = await prisma.salesEntry.groupBy({
    by: ['dateKey'],
    where: salesEntryWhereForBoutiqueMonth(input.boutiqueId, mk),
    _sum: { amount: true },
    _count: { id: true },
  });

  if (rows.length === 0) return null;

  const daily = new Map<string, YoYDayRow>();
  for (const r of rows) {
    daily.set(r.dateKey, {
      netSalesHalalas: (r._sum.amount ?? 0) * 100,
      invoices: r._count.id,
      pieces: 0,
    });
  }
  return daily;
}
