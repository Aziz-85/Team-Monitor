/**
 * GET /api/admin/sales/validate?month=YYYY-MM&boutiqueId=...
 * ADMIN only. Dev/debug: validate a month's SalesEntry vs Ledger totals.
 * Returns: ledgerLinesSumMTD, ledgerSummaryTotalMTD, salesEntrySumMTD, counts, mismatchDates (all).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDateRiyadh, getMonthRange } from '@/lib/time';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    user = await requireRole(['ADMIN']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? '';
  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId is required' }, { status: 400 });
  }

  const { start: monthStart, endExclusive: monthEndExclusive } = getMonthRange(month);
  const [salesEntryAgg, salesEntryByDateKey, ledgerSummaries] = await Promise.all([
    prisma.salesEntry.aggregate({
      where: { month, boutiqueId },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: { month, boutiqueId },
      _sum: { amount: true },
    }),
    prisma.boutiqueSalesSummary.findMany({
      where: {
        boutiqueId,
        date: { gte: monthStart, lt: monthEndExclusive },
      },
      include: { lines: true },
    }),
  ]);

  const salesEntryCountMTD = salesEntryAgg._count.id;
  const salesEntrySumMTD = salesEntryAgg._sum.amount ?? 0;
  let ledgerLineCountMTD = 0;
  let ledgerLinesSumMTD = 0;
  let ledgerSummaryTotalMTD = 0;
  const ledgerSumByDateKey = new Map<string, number>();
  for (const s of ledgerSummaries) {
    const dateKey = formatDateRiyadh(s.date);
    let daySum = 0;
    for (const line of s.lines) {
      ledgerLineCountMTD++;
      ledgerLinesSumMTD += line.amountSar;
      daySum += line.amountSar;
    }
    ledgerSumByDateKey.set(dateKey, (ledgerSumByDateKey.get(dateKey) ?? 0) + daySum);
    ledgerSummaryTotalMTD += s.totalSar;
  }

  const salesEntryByDateKeyMap = new Map(
    salesEntryByDateKey.map((r) => [r.dateKey, r._sum.amount ?? 0])
  );
  const mismatchDates: string[] = [];
  for (const [dateKey, ledgerSum] of Array.from(ledgerSumByDateKey.entries())) {
    const entrySum = salesEntryByDateKeyMap.get(dateKey) ?? 0;
    if (Math.abs(entrySum - ledgerSum) > 0) mismatchDates.push(dateKey);
  }
  const mismatch = Math.abs(salesEntrySumMTD - ledgerLinesSumMTD) > 0;

  return NextResponse.json({
    month,
    boutiqueId,
    salesEntryCountMTD,
    salesEntrySumMTD,
    ledgerLineCountMTD,
    ledgerLinesSumMTD,
    ledgerSummaryTotalMTD,
    mismatch,
    mismatchDates,
  });
}
