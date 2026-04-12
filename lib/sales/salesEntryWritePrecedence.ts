/**
 * Deterministic source precedence for SalesEntry writes (single definition).
 * Higher rank = stronger source. Incoming must be >= existing to replace (unless same source or admin force).
 *
 * Order (highest → lowest): MATRIX_MANUAL_EDIT (secure matrix console) → MANUAL → LEDGER → …
 *
 * HISTORICAL_CORRECTION (81) may replace same-tier historical rows; routes use `forceAdminOverride` only after
 * excluding MANUAL targets (see `lib/historical-sales-import/`).
 *
 * All endpoints must use `upsertCanonicalSalesEntry` — do not fork overwrite rules in routes.
 */

/** Higher number = wins when comparing two different sources. */
export function getSalesEntrySourceRank(source: string | null | undefined): number {
  const s = (source ?? '').trim().toUpperCase();
  switch (s) {
    case 'MATRIX_MANUAL_EDIT':
      return 105;
    case 'MANUAL':
      return 100;
    case 'LEDGER':
      return 90;
    /** Admin correction import: between LEDGER and bulk imports; never overwrites MANUAL (enforced in route). */
    case 'HISTORICAL_CORRECTION':
      return 81;
    case 'EXCEL_IMPORT':
    case 'YEARLY_IMPORT':
    case 'HISTORICAL_IMPORT':
      return 80;
    case 'API':
      return 75;
    case 'MATRIX':
    case 'MONTHLY_MATRIX_TRACE_V9':
      return 70;
    case 'IMPORT':
      return 65;
    default:
      return 0;
  }
}

/**
 * Whether an incoming write may replace an existing row (different source/amount path).
 * Same source string → always true (idempotent overwrite, Rule D).
 * forceAdminOverride → true (ADMIN+explicit flag only; set by callers after RBAC).
 */
export function incomingSalesWriteWinsPrecedence(
  existingSource: string | null | undefined,
  incomingSource: string,
  opts: { forceAdminOverride?: boolean }
): boolean {
  if (opts.forceAdminOverride) return true;
  const inc = incomingSource.trim();
  const ex = (existingSource ?? '').trim();
  if (inc.toUpperCase() === ex.toUpperCase()) return true;
  return getSalesEntrySourceRank(inc) >= getSalesEntrySourceRank(ex);
}
