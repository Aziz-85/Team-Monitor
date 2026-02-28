/**
 * Sync Daily Sales Ledger (BoutiqueSalesSummary + BoutiqueSalesLine) to SalesEntry.
 * Call after any ledger mutation so Executive Monthly / Dashboard read correct totals.
 * Input: boutiqueId + date + actorUserId. Operates on dateKey (YYYY-MM-DD Riyadh) only.
 */

import { prisma } from '@/lib/db';
import { syncSummaryToSalesEntry } from '@/lib/sales/syncLedgerToSalesEntry';
import { addDays, formatDateRiyadh, normalizeDateOnlyRiyadh, startOfDayRiyadh } from '@/lib/time';

const SALES_ENTRY_SOURCE_LEDGER = 'LEDGER';

export type SyncDailyLedgerInput = {
  boutiqueId: string;
  date: Date | string;
  actorUserId: string;
};

export type SyncDailyLedgerResult = {
  ok: boolean;
  summaryId: string | null;
  upserted: number;
  skipped: number;
  unmappedCount?: number;
  unmappedEmpIds?: string[];
  error?: string;
};

/**
 * Sync ledger for the given boutique+date to SalesEntry.
 * Finds summary by day range (Riyadh) to avoid DateTime mismatch; uses dateKey for SalesEntry.
 * If no summary for that day, deletes only SalesEntry with source='LEDGER' for that dateKey+boutique.
 */
export async function syncDailyLedgerToSalesEntry(
  input: SyncDailyLedgerInput
): Promise<SyncDailyLedgerResult> {
  const { boutiqueId, date, actorUserId } = input;
  const dateOnly = normalizeDateOnlyRiyadh(date);
  const dateKey = formatDateRiyadh(dateOnly);
  const dayStart = startOfDayRiyadh(dateOnly);
  const dayEnd = addDays(dayStart, 1);

  const summary = await prisma.boutiqueSalesSummary.findFirst({
    where: {
      boutiqueId,
      date: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true },
  });

  if (!summary) {
    await prisma.salesEntry.deleteMany({
      where: {
        boutiqueId,
        dateKey,
        source: SALES_ENTRY_SOURCE_LEDGER,
      },
    });
    return { ok: true, summaryId: null, upserted: 0, skipped: 0 };
  }

  try {
    const result = await syncSummaryToSalesEntry(summary.id, actorUserId);
    return {
      ok: true,
      summaryId: summary.id,
      upserted: result.upserted,
      skipped: result.skipped,
      unmappedCount: result.unmappedCount,
      unmappedEmpIds: result.unmappedEmpIds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === 'development') {
      console.warn('[syncDailyLedgerToSalesEntry]', message);
    }
    return {
      ok: false,
      summaryId: summary.id,
      upserted: 0,
      skipped: 0,
      error: message,
    };
  }
}
