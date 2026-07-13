/**
 * Rebuild SalesEntry projections from ledger for a date range (admin repair / backfill).
 */

import { formatDateRiyadh, getMonthRangeDayKeys, normalizeDateOnlyRiyadh } from '@/lib/time';
import { syncSalesProjections } from '@/lib/sales/syncSalesProjections';
import type { RebuildSalesProjectionsInput, RebuildSalesProjectionsResult } from '@/lib/sales/types';

function eachDateKey(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const start = normalizeDateOnlyRiyadh(from);
  const end = normalizeDateOnlyRiyadh(to);
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(formatDateRiyadh(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/**
 * Re-sync ledger → SalesEntry for every calendar day in [fromDate, toDate] (inclusive, Riyadh dateKey).
 */
export async function rebuildSalesProjections(
  input: RebuildSalesProjectionsInput
): Promise<RebuildSalesProjectionsResult> {
  const dateKeys = eachDateKey(input.fromDate, input.toDate);
  let totalUpserted = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const dateKey of dateKeys) {
    const result = await syncSalesProjections({
      boutiqueId: input.boutiqueId,
      date: dateKey,
      actorUserId: input.actorUserId,
      sourceOverride: input.sourceOverride,
    });
    if (!result.ok && result.error) {
      errors.push(`${dateKey}: ${result.error}`);
      continue;
    }
    totalUpserted += result.upserted;
    totalSkipped += result.skipped;
  }

  return {
    datesProcessed: dateKeys.length,
    totalUpserted,
    totalSkipped,
    errors,
  };
}

/**
 * Rebuild all days in a month that have a BoutiqueSalesSummary row.
 */
export async function rebuildSalesProjectionsForMonth(
  boutiqueId: string,
  monthKey: string,
  actorUserId: string,
  sourceOverride?: string
): Promise<RebuildSalesProjectionsResult> {
  const { startKey, endKey } = getMonthRangeDayKeys(monthKey);
  return rebuildSalesProjections({
    boutiqueId,
    fromDate: new Date(`${startKey}T00:00:00.000Z`),
    toDate: new Date(`${endKey}T00:00:00.000Z`),
    actorUserId,
    sourceOverride,
  });
}
