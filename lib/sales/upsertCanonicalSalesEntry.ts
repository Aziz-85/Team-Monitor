/**
 * Re-export: canonical SalesEntry write API lives in `upsertSalesEntry.ts`.
 * Import from either path — behavior is identical.
 */
export {
  upsertCanonicalSalesEntry,
  type UpsertCanonicalSalesEntryInput,
  type UpsertCanonicalSalesEntryResult,
  type UpsertSalesEntryKind,
  type SalesWriteSignals,
} from './upsertSalesEntry';
