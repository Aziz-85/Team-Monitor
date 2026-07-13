/**
 * Update canonical SalesEntry directly (admin import, manual canonical edit, branch daily total).
 * Routes must use this instead of calling `upsertCanonicalSalesEntry` directly.
 */

import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import type { UpdateCanonicalSaleInput } from '@/lib/sales/types';
import type { UpsertCanonicalSalesEntryResult } from '@/lib/sales/upsertSalesEntry';

export type UpdateBoutiqueSaleInput = UpdateCanonicalSaleInput;

/** Direct canonical write — respects precedence and ledger lock rules. */
export async function updateBoutiqueSale(
  input: UpdateBoutiqueSaleInput
): Promise<UpsertCanonicalSalesEntryResult> {
  return upsertCanonicalSalesEntry({
    boutiqueId: input.boutiqueId,
    userId: input.userId,
    amount: input.amount,
    source: input.source,
    actorUserId: input.actorUserId,
    date: input.date,
    kind: input.kind ?? 'direct',
    respectLedgerLock: input.respectLedgerLock,
    allowLockedOverride: input.allowLockedOverride,
    forceAdminOverride: input.forceAdminOverride,
    entryImportBatchId: input.entryImportBatchId,
    invoiceCount: input.invoiceCount,
    pieceCount: input.pieceCount,
  });
}

/** Alias for semantic clarity when creating a new canonical row. */
export const recordCanonicalSale = updateBoutiqueSale;
