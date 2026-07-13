/**
 * Post-import orchestration: sync ledger projections after batch apply.
 * Import parsers stay in their modules; this is the shared "confirm → project" step.
 */

import { syncSalesProjections } from '@/lib/sales/syncSalesProjections';
import type { ImportBoutiqueSalesSyncInput } from '@/lib/sales/types';

export type ImportBoutiqueSalesSyncBatchInput = {
  boutiqueId: string;
  actorUserId: string;
  dates: Array<Date | string>;
  sourceOverride?: string;
};

export type ImportBoutiqueSalesSyncBatchResult = {
  synced: number;
  failed: number;
  results: Array<Awaited<ReturnType<typeof syncSalesProjections>> & { date: string }>;
};

/** After ledger lines are written for multiple dates, project each day to SalesEntry. */
export async function importBoutiqueSalesSyncBatch(
  input: ImportBoutiqueSalesSyncBatchInput
): Promise<ImportBoutiqueSalesSyncBatchResult> {
  const uniqueDates = Array.from(
    new Set(input.dates.map((d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10))))
  );

  const results: ImportBoutiqueSalesSyncBatchResult['results'] = [];
  let synced = 0;
  let failed = 0;

  for (const date of uniqueDates) {
    const row = await syncSalesProjections({
      boutiqueId: input.boutiqueId,
      date,
      actorUserId: input.actorUserId,
      sourceOverride: input.sourceOverride,
    });
    results.push({ ...row, date });
    if (row.ok) synced += 1;
    else failed += 1;
  }

  return { synced, failed, results };
}

/** Single-day import sync (convenience). */
export async function importBoutiqueSales(input: ImportBoutiqueSalesSyncInput) {
  return syncSalesProjections(input);
}
