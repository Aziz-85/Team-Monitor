/** Unified import pipeline facade (Phase 4). */

export {
  computeImportFileSha256,
  importFileHashesMatch,
} from '@/lib/imports/fileHash';

export {
  validateImportUpload,
  importFileFromFormData,
  TARGETS_EXCEL_UPLOAD,
  YEARLY_SALES_UPLOAD,
  type ImportUploadValidationOptions,
  type ValidatedImportUpload,
} from '@/lib/imports/validateUpload';

export {
  importScopeKeyForBoutique,
  importScopeKeyForBoutiqueSet,
} from '@/lib/imports/scopeKey';

export {
  findImportDuplicate,
  recordImportPreview,
  markImportApplied,
} from '@/lib/imports/duplicate';

export {
  assertImportApplyAllowed,
  canForceImportReprocess,
} from '@/lib/imports/confirm';

export { runImportPreview } from '@/lib/imports/pipeline';

export type {
  ImportType,
  ImportFileStatus,
  ImportDuplicateInfo,
  ImportFileMetadata,
  ImportApplyGateResult,
} from '@/lib/imports/types';
