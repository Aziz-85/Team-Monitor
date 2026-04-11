/**
 * GET /api/admin/sales/validate?month=YYYY-MM&boutiqueId=...
 * ADMIN / SUPER_ADMIN. Validate a month's SalesEntry vs Ledger totals.
 * Optional: breakdown=1 — sums by SalesEntry.source and by entryImportBatchId (incident triage).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDateRiyadh, getMonthRange } from '@/lib/time';
import type { Role } from '@prisma/client';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    user = await requireRole(ADMIN_ROLES);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? '';
  const wantBreakdown = request.nextUrl.searchParams.get('breakdown') === '1';
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

  let bySource:
    | Array<{ source: string | null; rowCount: number; sumSar: number }>
    | undefined;
  let byImportBatch:
    | Array<{
        batchId: string;
        rowCount: number;
        sumSar: number;
        fileName: string | null;
        uploadedAt: string | null;
        status: string | null;
        importMode: string | null;
      }>
    | undefined;

  if (wantBreakdown) {
    const [sourceGroups, batchGroups] = await Promise.all([
      prisma.salesEntry.groupBy({
        by: ['source'],
        where: { month, boutiqueId },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.salesEntry.groupBy({
        by: ['entryImportBatchId'],
        where: { month, boutiqueId, entryImportBatchId: { not: null } },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    bySource = sourceGroups.map((r) => ({
      source: r.source ?? null,
      rowCount: r._count.id,
      sumSar: r._sum.amount ?? 0,
    }));

    const batchIds = batchGroups.map((r) => r.entryImportBatchId)
      .filter((id): id is string => id != null);
    const batches =
      batchIds.length > 0
        ? await prisma.salesEntryImportBatch.findMany({
            where: { id: { in: batchIds } },
            select: {
              id: true,
              fileName: true,
              uploadedAt: true,
              status: true,
              importMode: true,
            },
          })
        : [];
    const meta = new Map(batches.map((b) => [b.id, b]));

    byImportBatch = batchGroups.map((r) => {
      const id = r.entryImportBatchId!;
      const m = meta.get(id);
      return {
        batchId: id,
        rowCount: r._count.id,
        sumSar: r._sum.amount ?? 0,
        fileName: m?.fileName ?? null,
        uploadedAt: m?.uploadedAt?.toISOString() ?? null,
        status: m?.status ?? null,
        importMode: m?.importMode ?? null,
      };
    });
  }

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
    note:
      'Dashboard KPIs sum SalesEntry once per row (groupBy userId). If totals look doubled, stored amounts or extra writes are the cause — use byImportBatch rollback or manual correction.',
    ...(wantBreakdown ? { bySource, byImportBatch } : {}),
  });
}
