/**
 * Shared types for the sales service layer (Architecture Stabilization Phase 1).
 */

import type { SalesLineSource } from '@prisma/client';
import type { ReconcileResult } from '@/lib/sales/reconcile';
import type { SyncDailyLedgerResult } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import type { SyncSummaryResult } from '@/lib/sales/syncLedgerToSalesEntry';
import type { UpsertCanonicalSalesEntryResult } from '@/lib/sales/upsertSalesEntry';

export type SalesServiceWarning = string;

export type RecordBoutiqueSaleInput = {
  /** Server-trusted boutique (upload / operational scope). Sale ownership stays here. */
  boutiqueId: string;
  date: Date;
  /** Employee.empId */
  employeeId: string;
  amountSar: number;
  actorUserId: string;
  lineSource?: SalesLineSource;
  /**
   * Manual daily entry: employee must belong to boutique (security).
   * Import paths: false — warnings only via `collectSalesOwnershipWarnings`.
   */
  requireEmployeeInBoutique?: boolean;
};

export type RecordBoutiqueSaleResult =
  | {
      ok: true;
      summaryId: string;
      lineId: string;
      warnings: SalesServiceWarning[];
      sync: SyncSummaryResult;
      reconcile: ReconcileResult;
      wasLocked: boolean;
    }
  | { ok: false; error: string; status: 'validation' | 'conflict' | 'not_found' };

export type RemoveBoutiqueSaleLineInput = {
  boutiqueId: string;
  date: Date;
  employeeId: string;
  actorUserId: string;
};

export type RemoveBoutiqueSaleLineResult =
  | {
      ok: true;
      summaryId: string;
      sync: SyncSummaryResult;
      reconcile: ReconcileResult | null;
      wasLocked: boolean;
    }
  | { ok: false; error: string; status: 'not_found' | 'validation' };

export type UpdateCanonicalSaleInput = {
  boutiqueId: string;
  userId: string;
  date: Date | string;
  amount: number;
  source: string;
  actorUserId: string;
  kind?: 'ledger_sync' | 'direct';
  respectLedgerLock?: boolean;
  allowLockedOverride?: boolean;
  forceAdminOverride?: boolean;
  entryImportBatchId?: string | null;
  invoiceCount?: number | null;
  pieceCount?: number | null;
};

export type ImportBoutiqueSalesSyncInput = {
  boutiqueId: string;
  date: Date | string;
  actorUserId: string;
  sourceOverride?: string;
};

export type RebuildSalesProjectionsInput = {
  boutiqueId: string;
  fromDate: Date;
  toDate: Date;
  actorUserId: string;
  sourceOverride?: string;
};

export type RebuildSalesProjectionsResult = {
  datesProcessed: number;
  totalUpserted: number;
  totalSkipped: number;
  errors: string[];
};

export type EmployeePerformanceResult = {
  userId: string;
  fromDate: Date;
  toDate: Date;
  sales: number;
  target: number | null;
  targetStatus: 'assigned' | 'missing';
  hasMonthlyTarget: boolean;
  achievement: {
    remaining: number | null;
    percent: number | null;
  };
  warnings: SalesServiceWarning[];
};

export type BoutiquePerformanceResult = {
  boutiqueId: string;
  fromDate: Date;
  toDate: Date;
  sales: number;
  target: number | null;
  targetStatus: 'assigned' | 'missing';
  hasMonthlyTarget: boolean;
  achievement: {
    remaining: number | null;
    percent: number | null;
  };
};

export type { SyncDailyLedgerResult, SyncSummaryResult, UpsertCanonicalSalesEntryResult };
