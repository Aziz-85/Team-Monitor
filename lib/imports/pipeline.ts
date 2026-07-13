import { computeImportFileSha256 } from '@/lib/imports/fileHash';
import {
  findImportDuplicate,
  recordImportPreview,
} from '@/lib/imports/duplicate';
import type {
  ImportDuplicateInfo,
  ImportFileMetadata,
  ImportType,
} from '@/lib/imports/types';
import {
  validateImportUpload,
  type ImportUploadValidationOptions,
  type ValidatedImportUpload,
} from '@/lib/imports/validateUpload';

export type RunImportPreviewInput<TPreview> = {
  importType: ImportType;
  scopeKey: string;
  boutiqueId?: string | null;
  uploadedById: string;
  file: Blob | File | null | undefined;
  validate: ImportUploadValidationOptions;
  parse: (upload: ValidatedImportUpload, meta: ImportFileMetadata) => Promise<TPreview> | TPreview;
  canApply?: (preview: TPreview) => boolean;
};

export type ImportPreviewEnvelope<TPreview> = TPreview &
  ImportFileMetadata & {
    duplicateFile: ImportDuplicateInfo | null;
    applyBlockedByDuplicate: boolean;
  };

export async function runImportPreview<TPreview>(
  input: RunImportPreviewInput<TPreview>
): Promise<
  | { ok: true; result: ImportPreviewEnvelope<TPreview> }
  | { ok: false; error: string; status: number }
> {
  const validated = await validateImportUpload(input.file, input.validate);
  if (!validated.ok) {
    return { ok: false, error: validated.error, status: validated.status };
  }

  const fileSha256 = computeImportFileSha256(validated.upload.buffer);
  const meta: ImportFileMetadata = {
    fileSha256,
    fileName: validated.upload.fileName,
    fileSizeBytes: validated.upload.fileSizeBytes,
  };

  const duplicateFile = await findImportDuplicate({
    importType: input.importType,
    scopeKey: input.scopeKey,
    fileSha256,
  });

  const preview = await input.parse(validated.upload, meta);

  await recordImportPreview({
    importType: input.importType,
    scopeKey: input.scopeKey,
    fileSha256,
    originalFileName: validated.upload.fileName,
    fileSizeBytes: validated.upload.fileSizeBytes,
    boutiqueId: input.boutiqueId,
    uploadedById: input.uploadedById,
  });

  const parseAllowsApply = input.canApply ? input.canApply(preview) : true;
  const applyBlockedByDuplicate =
    duplicateFile?.status === 'APPLIED' || !parseAllowsApply;

  return {
    ok: true,
    result: {
      ...preview,
      ...meta,
      duplicateFile,
      applyBlockedByDuplicate,
    },
  };
}
