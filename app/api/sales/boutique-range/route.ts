/** Read-only boutique sales for an inclusive date range, sourced from canonical SalesEntry. */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { prisma } from '@/lib/db';
import { validateBoutiqueSalesRange } from '@/lib/sales/boutiqueDateRange';
import { salesEntryWhereDateRangeInclusive } from '@/lib/sales/readSalesAggregate';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ASSISTANT_MANAGER', 'MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;

  const from = request.nextUrl.searchParams.get('from')?.trim() ?? '';
  const to = request.nextUrl.searchParams.get('to')?.trim() ?? '';
  const validationError = validateBoutiqueSalesRange(from, to);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const rows = await prisma.salesEntry.groupBy({
    by: ['dateKey'],
    where: salesEntryWhereDateRangeInclusive({
      boutiqueId: scope.boutiqueId,
      from: new Date(`${from}T00:00:00.000Z`),
      to: new Date(`${to}T00:00:00.000Z`),
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

  return NextResponse.json({
    boutiqueId: scope.boutiqueId,
    boutiqueLabel: scope.boutiqueLabel,
    from,
    to,
    totals,
    days,
  });
}
