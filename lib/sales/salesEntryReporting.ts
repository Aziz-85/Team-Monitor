/**
 * Canonical reporting rule: **SalesEntry** is the single read model for daily employee sales.
 * The `source` column is metadata (origin of the last write). Dashboards and aggregators must not
 * apply a narrow `source IN (...)` filter, or legitimate rows (e.g. trace imports, MATRIX, API) disappear.
 * Boutique scope and date keys provide isolation.
 *
 * **Aggregations:** use `lib/sales/readSalesAggregate.ts` (approved internal layer over SalesEntry).
 * **Writes:** use `lib/sales/upsertSalesEntry.ts` (`upsertCanonicalSalesEntry`) + `salesEntryWritePrecedence.ts`.
 */

export {};
