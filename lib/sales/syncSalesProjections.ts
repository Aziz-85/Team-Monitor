/**
 * Sync ledger → canonical SalesEntry projections.
 * All ledger mutations must call this (or rebuildSalesProjections) — do not write SalesEntry directly from routes.
 */

export {
  syncSummaryToSalesEntry,
  type SyncSummaryResult,
} from '@/lib/sales/syncLedgerToSalesEntry';

export {
  syncDailyLedgerToSalesEntry,
  type SyncDailyLedgerInput,
  type SyncDailyLedgerResult,
} from '@/lib/sales/syncDailyLedgerToSalesEntry';

import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import { syncSummaryToSalesEntry } from '@/lib/sales/syncLedgerToSalesEntry';
import type { ImportBoutiqueSalesSyncInput } from '@/lib/sales/types';

/** Preferred name — sync one boutique+date after ledger write/import. */
export async function syncSalesProjections(input: ImportBoutiqueSalesSyncInput) {
  return syncDailyLedgerToSalesEntry({
    boutiqueId: input.boutiqueId,
    date: input.date,
    actorUserId: input.actorUserId,
    sourceOverride: input.sourceOverride,
  });
}

/** Sync from an existing summary row (e.g. after line upsert when summary id is known). */
export async function syncSalesProjectionsFromSummary(
  summaryId: string,
  actorUserId: string,
  sourceForEntry?: string
) {
  return syncSummaryToSalesEntry(summaryId, actorUserId, sourceForEntry);
}
