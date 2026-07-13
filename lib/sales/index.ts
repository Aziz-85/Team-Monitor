/**
 * Team Monitor — Sales service layer (Architecture Stabilization Phase 1).
 *
 * **Write paths**
 * - Daily ledger lines → `recordBoutiqueSale` / `removeBoutiqueSaleLine` → `syncSalesProjections`
 * - Canonical direct → `updateBoutiqueSale` (`upsertCanonicalSalesEntry` internally)
 * - Import batch → `importBoutiqueSales` / `importBoutiqueSalesSyncBatch`
 *
 * **Read paths**
 * - KPI totals → `readSalesAggregate` (existing) + `getEmployeePerformance` / `getBoutiquePerformance`
 *
 * See `docs/architecture-stabilization/SALES_SOURCE_OF_TRUTH.md`.
 */

// Canonical write (low-level — prefer updateBoutiqueSale from routes)
export {
  upsertCanonicalSalesEntry,
  type UpsertCanonicalSalesEntryInput,
  type UpsertCanonicalSalesEntryResult,
} from '@/lib/sales/upsertSalesEntry';

// Ledger line writes
export { recordBoutiqueSale, removeBoutiqueSaleLine } from '@/lib/sales/recordBoutiqueSale';

// Canonical direct writes
export { updateBoutiqueSale, recordCanonicalSale } from '@/lib/sales/updateBoutiqueSale';

// Projections sync
export {
  syncSalesProjections,
  syncSalesProjectionsFromSummary,
  syncSummaryToSalesEntry,
  syncDailyLedgerToSalesEntry,
} from '@/lib/sales/syncSalesProjections';

export { rebuildSalesProjections, rebuildSalesProjectionsForMonth } from '@/lib/sales/rebuildSalesProjections';

// Import orchestration
export {
  importBoutiqueSales,
  importBoutiqueSalesSyncBatch,
  type ImportBoutiqueSalesSyncBatchInput,
  type ImportBoutiqueSalesSyncBatchResult,
} from '@/lib/sales/importBoutiqueSales';

// Performance (canonical reads — Phase 5)
export { getEmployeePerformance, calculateEmployeePerformance } from '@/lib/sales/getEmployeePerformance';
export {
  getBoutiquePerformance,
  calculateBoutiquePerformance,
  getSalesBreakdownByBoutiqueForEmployee,
} from '@/lib/sales/getBoutiquePerformance';

// Attribution warnings
export {
  collectSalesOwnershipWarnings,
  collectMultiBoutiqueSameDayWarning,
  collectImportSalesWarnings,
} from '@/lib/sales/salesOwnershipWarnings';

// Read layer (existing SSOT)
export {
  aggregateSalesEntrySum,
  getSalesMetricsFromSalesEntry,
  groupSalesByUserForBoutiqueMonth,
} from '@/lib/sales/readSalesAggregate';

export { sumBoutiqueSales, sumEmployeeSales, sumEmployeeSalesByBoutique } from '@/lib/sales/attribution';

// Employee boutique resolution (Phase 2)
export {
  resolveEmployeeBoutiqueAtDate,
  resolveEmployeeBoutiqueAtDateCached,
  isEmployeeAtBoutiqueOnDate,
  buildResolutionWarningsForUpload,
} from '@/lib/employees/resolveEmployeeBoutiqueAtDate';

export type {
  EmployeeBoutiqueResolution,
  EmployeeBoutiqueResolutionSource,
} from '@/lib/employees/resolveEmployeeBoutiqueAtDate';

export type {
  RecordBoutiqueSaleInput,
  RecordBoutiqueSaleResult,
  UpdateCanonicalSaleInput,
  EmployeePerformanceResult,
  BoutiquePerformanceResult,
  RebuildSalesProjectionsInput,
  RebuildSalesProjectionsResult,
} from '@/lib/sales/types';
