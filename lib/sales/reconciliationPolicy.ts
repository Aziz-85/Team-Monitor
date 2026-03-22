/**
 * Single explicit policy for historical SalesEntry imports vs Daily Sales Ledger.
 * See: docs/historical-ledger-reconciliation.md
 *
 * POLICY A — Historical admin imports do **not** backfill ledger tables.
 */

export const HISTORICAL_LEDGER_RECONCILIATION_POLICY = {
  id: 'POLICY_A' as const,
  label: 'Canonical SalesEntry-only historical imports',
  summary:
    'HISTORICAL_IMPORT / HISTORICAL_CORRECTION write SalesEntry only. BoutiqueSalesSummary/BoutiqueSalesLine are not updated. Parity diagnostics compare SalesEntry helpers only — never SalesEntry vs ledger totals.',
  documentationPath: 'docs/historical-ledger-reconciliation.md',
} as const;

export type HistoricalLedgerReconciliationPolicy = typeof HISTORICAL_LEDGER_RECONCILIATION_POLICY;
