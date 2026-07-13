import { prisma } from '@/lib/db';
import type { ImportDuplicateInfo, ImportFileStatus, ImportType } from '@/lib/imports/types';

export type FindImportDuplicateInput = {
  importType: ImportType;
  scopeKey: string;
  fileSha256: string;
};

function toIso(date: Date): string {
  return date.toISOString();
}

async function mapRecord(
  importType: ImportType,
  fileSha256: string,
  row: {
    id: string;
    originalFileName: string;
    uploadedAt: Date;
    uploadedById: string;
    status: string;
    batchId: string | null;
    batchEntityType: string | null;
    uploadedBy: { employee: { name: string } | null } | null;
  }
): Promise<ImportDuplicateInfo> {
  return {
    recordId: row.id,
    importType,
    fileSha256,
    originalFileName: row.originalFileName,
    uploadedAt: toIso(row.uploadedAt),
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedBy?.employee?.name ?? null,
    status: row.status as ImportFileStatus,
    batchId: row.batchId,
    batchEntityType: row.batchEntityType,
  };
}

/** Lookup unified fingerprint and legacy batch tables. */
export async function findImportDuplicate(
  input: FindImportDuplicateInput
): Promise<ImportDuplicateInfo | null> {
  const existing = await prisma.importFileRecord.findUnique({
    where: {
      importType_scopeKey_fileSha256: {
        importType: input.importType,
        scopeKey: input.scopeKey,
        fileSha256: input.fileSha256,
      },
    },
    include: {
      uploadedBy: { select: { employee: { select: { name: true } } } },
    },
  });

  if (existing && (existing.status === 'APPLIED' || existing.status === 'PREVIEW')) {
    return mapRecord(input.importType, input.fileSha256, existing);
  }

  if (input.importType === 'YEARLY_SALES' || input.importType === 'MSR_SALES') {
    const legacy = await prisma.salesEntryImportBatch.findFirst({
      where: { fileSha256: input.fileSha256, status: 'APPLIED' },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { employee: { select: { name: true } } } },
      },
    });
    if (legacy) {
      return {
        recordId: legacy.id,
        importType: input.importType,
        fileSha256: input.fileSha256,
        originalFileName: legacy.fileName,
        uploadedAt: toIso(legacy.uploadedAt),
        uploadedById: legacy.uploadedById,
        uploadedByName: legacy.uploadedBy?.employee?.name ?? null,
        status: 'APPLIED',
        batchId: legacy.id,
        batchEntityType: 'SalesEntryImportBatch',
        legacySource: 'SalesEntryImportBatch',
      };
    }
  }

  if (input.importType === 'SALES_LEDGER') {
    const boutiqueId = input.scopeKey.startsWith('boutique:')
      ? input.scopeKey.slice('boutique:'.length)
      : null;
    if (boutiqueId) {
      const legacy = await prisma.salesLedgerBatch.findFirst({
        where: { boutiqueId, fileHash: input.fileSha256 },
        orderBy: { createdAt: 'desc' },
        include: {
          importedBy: { select: { employee: { select: { name: true } } } },
        },
      });
      if (legacy) {
        return {
          recordId: legacy.id,
          importType: input.importType,
          fileSha256: input.fileSha256,
          originalFileName: legacy.fileName ?? 'ledger-import',
          uploadedAt: toIso(legacy.createdAt),
          uploadedById: legacy.importedById,
          uploadedByName: legacy.importedBy?.employee?.name ?? null,
          status: 'APPLIED',
          batchId: legacy.id,
          batchEntityType: 'SalesLedgerBatch',
          legacySource: 'SalesLedgerBatch',
        };
      }
    }
  }

  return null;
}

export type RecordImportPreviewInput = {
  importType: ImportType;
  scopeKey: string;
  fileSha256: string;
  originalFileName: string;
  fileSizeBytes: number;
  boutiqueId?: string | null;
  uploadedById: string;
};

/** Upsert preview fingerprint (does not mark APPLIED). */
export async function recordImportPreview(input: RecordImportPreviewInput): Promise<string> {
  const row = await prisma.importFileRecord.upsert({
    where: {
      importType_scopeKey_fileSha256: {
        importType: input.importType,
        scopeKey: input.scopeKey,
        fileSha256: input.fileSha256,
      },
    },
    create: {
      importType: input.importType,
      scopeKey: input.scopeKey,
      fileSha256: input.fileSha256,
      originalFileName: input.originalFileName,
      fileSizeBytes: input.fileSizeBytes,
      boutiqueId: input.boutiqueId ?? undefined,
      uploadedById: input.uploadedById,
      status: 'PREVIEW',
    },
    update: {
      originalFileName: input.originalFileName,
      fileSizeBytes: input.fileSizeBytes,
      uploadedById: input.uploadedById,
      uploadedAt: new Date(),
      status: 'PREVIEW',
      batchId: null,
      batchEntityType: null,
    },
    select: { id: true },
  });
  return row.id;
}

export type MarkImportAppliedInput = {
  importType: ImportType;
  scopeKey: string;
  fileSha256: string;
  batchId?: string | null;
  batchEntityType?: string | null;
};

export async function markImportApplied(input: MarkImportAppliedInput): Promise<void> {
  await prisma.importFileRecord.updateMany({
    where: {
      importType: input.importType,
      scopeKey: input.scopeKey,
      fileSha256: input.fileSha256,
    },
    data: {
      status: 'APPLIED',
      batchId: input.batchId ?? undefined,
      batchEntityType: input.batchEntityType ?? undefined,
      uploadedAt: new Date(),
    },
  });
}
