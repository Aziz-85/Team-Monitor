import { prisma } from '@/lib/db';
import { salesEntryWhereDateRangeInclusive } from '@/lib/sales/readSalesAggregate';

export type BoutiqueRangeReport = {
  boutiqueId: string;
  boutiqueLabel: string;
  from: string;
  to: string;
  totals: { salesSar: number; invoices: number; pieces: number };
  days: Array<{ date: string; salesSar: number; invoices: number; pieces: number }>;
};

/** Shared by the on-screen report and XLSX export so their totals cannot drift. */
export async function loadBoutiqueRangeReport(input: {
  boutiqueId: string;
  boutiqueLabel: string;
  from: string;
  to: string;
}): Promise<BoutiqueRangeReport> {
  const rows = await prisma.salesEntry.groupBy({
    by: ['dateKey'],
    where: salesEntryWhereDateRangeInclusive({
      boutiqueId: input.boutiqueId,
      from: new Date(`${input.from}T00:00:00.000Z`),
      to: new Date(`${input.to}T00:00:00.000Z`),
    }),
    _sum: { amount: true, invoiceCount: true, pieceCount: true },
    orderBy: { dateKey: 'asc' },
  });

  const days = rows.map((row) => ({
    date: row.dateKey,
    salesSar: row._sum.amount ?? 0,
    invoices: row._sum.invoiceCount ?? 0,
    pieces: row._sum.pieceCount ?? 0,
  }));
  const totals = days.reduce(
    (sum, day) => ({
      salesSar: sum.salesSar + day.salesSar,
      invoices: sum.invoices + day.invoices,
      pieces: sum.pieces + day.pieces,
    }),
    { salesSar: 0, invoices: 0, pieces: 0 }
  );

  return { ...input, totals, days };
}
