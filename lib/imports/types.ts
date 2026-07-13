/** Shared import pipeline types (Phase 4). */

export type ImportType =
  | 'TARGETS_BOUTIQUE'
  | 'TARGETS_EMPLOYEE'
  | 'YEARLY_SALES'
  | 'MSR_SALES'
  | 'SALES_LEDGER'
  | 'KPI';

export type ImportFileStatus = 'PREVIEW' | 'APPLIED' | 'FAILED';

export type ImportDuplicateInfo = {
  recordId: string;
  importType: ImportType;
  fileSha256: string;
  originalFileName: string;
  uploadedAt: string;
  uploadedById: string;
  uploadedByName: string | null;
  status: ImportFileStatus;
  batchId: string | null;
  batchEntityType: string | null;
  /** Legacy batch when fingerprint predates ImportFileRecord. */
  legacySource?: 'SalesEntryImportBatch' | 'SalesLedgerBatch' | 'KpiUpload';
};

export type ImportFileMetadata = {
  fileSha256: string;
  fileName: string;
  fileSizeBytes: number;
};

export type ImportApplyGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'DUPLICATE_FILE' | 'MISSING_HASH' | 'HASH_MISMATCH' | 'REPROCESS_FORBIDDEN';
      duplicate?: ImportDuplicateInfo;
      message: string;
    };
