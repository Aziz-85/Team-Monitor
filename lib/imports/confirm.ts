import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { computeImportFileSha256, importFileHashesMatch } from '@/lib/imports/fileHash';
import { findImportDuplicate } from '@/lib/imports/duplicate';
import type { ImportApplyGateResult, ImportType } from '@/lib/imports/types';

export function canForceImportReprocess(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export type AssertImportApplyAllowedInput = {
  importType: ImportType;
  scopeKey: string;
  fileSha256: string | null | undefined;
  forceReprocess?: boolean;
  actorUserId: string;
  actorRole: Role;
  auditBoutiqueId?: string | null;
  /** When re-uploading file on apply, verify bytes match dry-run hash. */
  fileBuffer?: Buffer | null;
};

export async function assertImportApplyAllowed(
  input: AssertImportApplyAllowedInput
): Promise<ImportApplyGateResult> {
  const hash = (input.fileSha256 ?? '').trim();
  if (!hash) {
    return {
      allowed: false,
      reason: 'MISSING_HASH',
      message: 'fileSha256 is required from the dry-run preview',
    };
  }

  if (input.fileBuffer) {
    const actual = computeImportFileSha256(input.fileBuffer);
    if (!importFileHashesMatch(hash, actual)) {
      return {
        allowed: false,
        reason: 'HASH_MISMATCH',
        message: 'Uploaded file does not match the dry-run fileSha256',
      };
    }
  }

  const duplicate = await findImportDuplicate({
    importType: input.importType,
    scopeKey: input.scopeKey,
    fileSha256: hash,
  });

  if (duplicate?.status === 'APPLIED') {
    if (input.forceReprocess && canForceImportReprocess(input.actorRole)) {
      await prisma.auditLog.create({
        data: {
          module: 'ADMIN',
          action: 'IMPORT_FILE_REPROCESS',
          entityType: input.importType,
          entityId: duplicate.batchId ?? duplicate.recordId,
          actorUserId: input.actorUserId,
          boutiqueId: input.auditBoutiqueId ?? undefined,
          reason: `Reprocess duplicate file ${hash.slice(0, 12)}…`,
          afterJson: JSON.stringify({
            importType: input.importType,
            scopeKey: input.scopeKey,
            previousBatchId: duplicate.batchId,
            previousUploadedAt: duplicate.uploadedAt,
          }),
        },
      });
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'DUPLICATE_FILE',
      duplicate,
      message:
        'This file was already imported. Use forceReprocess with admin permission to apply again.',
    };
  }

  return { allowed: true };
}
