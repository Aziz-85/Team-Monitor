/**
 * GET/POST /api/admin/sales/repair — Self-heal SalesEntry from Daily Ledger.
 * ADMIN only. Syncs ONLY on real ledger dates (from BoutiqueSalesSummary), not a naive date loop.
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD, boutiqueId=optional (else all active boutiques).
 * Returns: ledgerDatesFound, repairedCount, salesEntrySumAfter, ledgerLinesSum, mismatchDatesAfter, tookMs.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import { formatDateRiyadh, normalizeDateOnlyRiyadh } from '@/lib/time';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

async function getParams(request: NextRequest): Promise<{ from: string; to: string; boutiqueId: string | null }> {
  const url = request.nextUrl;
  if (request.method === 'GET') {
    return {
      from: url.searchParams.get('from') ?? '',
      to: url.searchParams.get('to') ?? '',
      boutiqueId: url.searchParams.get('boutiqueId')?.trim() || null,
    };
  }
  const body = await request.json().catch(() => ({}));
  return {
    from: typeof body.from === 'string' ? body.from.trim() : '',
    to: typeof body.to === 'string' ? body.to.trim() : '',
    boutiqueId: typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() || null : null,
  };
}

export async function GET(request: NextRequest) {
  return runRepair(request);
}

export async function POST(request: NextRequest) {
  return runRepair(request);
}

async function runRepair(request: NextRequest) {
  const started = Date.now();
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.boutiqueId) return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });

  const { from, to, boutiqueId: paramBoutiqueId } = await getParams(request);

  if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to)) {
    return NextResponse.json(
      { error: 'from and to are required as YYYY-MM-DD' },
      { status: 400 }
    );
  }
  const rangeStart = normalizeDateOnlyRiyadh(from);
  const rangeEnd = normalizeDateOnlyRiyadh(to);
  if (rangeStart.getTime() > rangeEnd.getTime()) {
    return NextResponse.json({ error: 'from must be <= to' }, { status: 400 });
  }

  let boutiqueIds: string[];
  if (paramBoutiqueId) {
    boutiqueIds = [paramBoutiqueId];
  } else {
    const boutiques = await prisma.boutique.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    boutiqueIds = boutiques.map((b) => b.id);
  }

  const summariesInRange = await prisma.boutiqueSalesSummary.findMany({
    where: {
      boutiqueId: { in: boutiqueIds },
      date: { gte: rangeStart, lte: rangeEnd },
    },
    select: { boutiqueId: true, date: true },
  });

  const distinctByBoutiqueAndDateKey = new Map<string, { boutiqueId: string; dateKey: string }>();
  for (const s of summariesInRange) {
    const dateKey = formatDateRiyadh(s.date);
    const key = `${s.boutiqueId}:${dateKey}`;
    if (!distinctByBoutiqueAndDateKey.has(key)) {
      distinctByBoutiqueAndDateKey.set(key, { boutiqueId: s.boutiqueId, dateKey });
    }
  }
  const ledgerDatesToSync = Array.from(distinctByBoutiqueAndDateKey.values());
  const ledgerDatesFound = ledgerDatesToSync.length;

  const warnings: string[] = [];
  let repairedCount = 0;
  for (const { boutiqueId, dateKey } of ledgerDatesToSync) {
    const result = await syncDailyLedgerToSalesEntry({
      boutiqueId,
      date: dateKey,
      actorUserId: user.id,
    });
    if (result.error) {
      warnings.push(`${boutiqueId}/${dateKey}: ${result.error}`);
    } else {
      repairedCount++;
    }
  }

  const [ledgerSummaries, salesEntryByDateKey] = await Promise.all([
    prisma.boutiqueSalesSummary.findMany({
      where: {
        boutiqueId: { in: boutiqueIds },
        date: { gte: rangeStart, lte: rangeEnd },
      },
      include: { lines: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: {
        boutiqueId: { in: boutiqueIds },
        dateKey: { gte: from, lte: to },
      },
      _sum: { amount: true },
    }),
  ]);

  let ledgerLinesSum = 0;
  const ledgerSumByDateKey = new Map<string, number>();
  for (const s of ledgerSummaries) {
    const key = formatDateRiyadh(s.date);
    const sum = s.lines.reduce((a, l) => a + l.amountSar, 0);
    ledgerLinesSum += sum;
    ledgerSumByDateKey.set(key, (ledgerSumByDateKey.get(key) ?? 0) + sum);
  }

  let salesEntrySumAfter = 0;
  const entrySumByDateKey = new Map<string, number>();
  for (const r of salesEntryByDateKey) {
    const key = r.dateKey;
    const sum = r._sum.amount ?? 0;
    salesEntrySumAfter += sum;
    entrySumByDateKey.set(key, (entrySumByDateKey.get(key) ?? 0) + sum);
  }

  const mismatchDatesAfter: string[] = [];
  const allDateKeys = Array.from(
    new Set([
      ...Array.from(ledgerSumByDateKey.keys()),
      ...Array.from(entrySumByDateKey.keys()),
    ])
  );
  for (const d of allDateKeys) {
    const ledgerSum = ledgerSumByDateKey.get(d) ?? 0;
    const entrySum = entrySumByDateKey.get(d) ?? 0;
    if (Math.abs(ledgerSum - entrySum) > 0) mismatchDatesAfter.push(d);
  }

  const tookMs = Date.now() - started;
  return NextResponse.json({
    ledgerDatesFound,
    repairedCount,
    warnings,
    tookMs,
    ledgerLinesSum,
    salesEntrySumAfter,
    mismatchDatesAfter,
  });
}
