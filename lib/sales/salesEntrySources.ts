/**
 * SalesEntry.source records how the current canonical row last arrived; it is not a parallel truth.
 * Reporting must include all SalesEntry rows regardless of source (see lib/sales/salesEntryReporting.ts).
 *
 * Preferred values for new writes:
 * - LEDGER — propagated from Daily Sales Ledger (BoutiqueSalesSummary / BoutiqueSalesLine)
 * - MATRIX — monthly matrix file import (/api/sales/import/matrix)
 * - EXCEL_IMPORT — spreadsheet imports that write canonical rows directly
 * - MANUAL — employee/manager direct canonical edit
 * - API — programmatic writes through approved APIs
 * - HISTORICAL_IMPORT — admin Import Center “historical initial” (SalesEntry-only, insert-if-empty policy in route)
 * - HISTORICAL_CORRECTION — admin historical correction import (explicit reason; not for live matrix)
 *
 * Legacy strings may exist in DB (e.g. IMPORT, MONTHLY_MATRIX_TRACE_V9); reads must not exclude them.
 *
 * Overwrite order for writes is defined only in `salesEntryWritePrecedence.ts` (used by `upsertCanonicalSalesEntry`).
 */
export const SALES_ENTRY_SOURCE = {
  LEDGER: 'LEDGER',
  MATRIX: 'MATRIX',
  EXCEL_IMPORT: 'EXCEL_IMPORT',
  MANUAL: 'MANUAL',
  API: 'API',
  /** Admin historical backfill: canonical row insert only via dedicated import route (no silent overwrite). */
  HISTORICAL_IMPORT: 'HISTORICAL_IMPORT',
  /** Admin correction pass for rows already loaded from historical/yearly paths; never targets MANUAL rows. */
  HISTORICAL_CORRECTION: 'HISTORICAL_CORRECTION',
  /** @deprecated prefer MATRIX or EXCEL_IMPORT */
  IMPORT: 'IMPORT',
} as const;

export type SalesEntrySourceValue = (typeof SALES_ENTRY_SOURCE)[keyof typeof SALES_ENTRY_SOURCE];
