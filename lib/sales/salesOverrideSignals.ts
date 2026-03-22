/**
 * Read-side signals for precedence / non-LEDGER visibility (no persisted rejection log in DB).
 * Rejected writes return from `upsertCanonicalSalesEntry` but are not stored — see `note` in API responses.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';

export type SalesOverrideSignalsResult = {
  summary: {
    countBySource: Record<string, number>;
    amountBySource: Record<string, number>;
  };
  /** Rows where final `source` is not LEDGER (implies manual/matrix/excel path won precedence). */
  nonLedgerRows: Array<{
    id: string;
    boutiqueId: string;
    userId: string;
    dateKey: string;
    amount: number;
    source: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  /** Always empty until a future persisted rejection queue exists. */
  rejectedWrites: unknown[];
  note: string;
};

export async function getSalesOverrideSignals(input: {
  boutiqueId?: string;
  monthKey?: string;
  limit?: number;
}): Promise<SalesOverrideSignalsResult> {
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  const where: Prisma.SalesEntryWhereInput = {};
  if (input.boutiqueId) where.boutiqueId = input.boutiqueId;
  if (input.monthKey) where.month = normalizeMonthKey(input.monthKey);

  const [bySource, nonLedgerRows] = await Promise.all([
    prisma.salesEntry.groupBy({
      by: ['source'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.salesEntry.findMany({
      where: { ...where, NOT: { source: 'LEDGER' } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        boutiqueId: true,
        userId: true,
        dateKey: true,
        amount: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const countBySource: Record<string, number> = {};
  const amountBySource: Record<string, number> = {};
  for (const r of bySource) {
    const key = r.source ?? '(null)';
    countBySource[key] = r._count.id;
    amountBySource[key] = r._sum.amount ?? 0;
  }

  return {
    summary: { countBySource, amountBySource },
    nonLedgerRows,
    rejectedWrites: [],
    note:
      'Rejected writes are not persisted server-side. Successful rows show final `source` after precedence. Use write API responses for real-time precedence (see upsertCanonicalSalesEntry signals).',
  };
}
