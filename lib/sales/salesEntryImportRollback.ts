/**
 * Rollback admin SalesEntry imports using SalesEntryImportBatch / Line audit trail.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type RollbackPreview = {
  batchId: string;
  fileName: string;
  uploadedAt: string;
  status: string;
  linesToDelete: number;
  linesToRestore: number;
  totalSarRemoved: number;
  totalSarRestoredDelta: number;
  limitations: string[];
  sampleLineIds: string[];
};

export async function previewSalesEntryImportRollback(batchId: string): Promise<RollbackPreview | null> {
  const batch = await prisma.salesEntryImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      fileName: true,
      uploadedAt: true,
      status: true,
    },
  });
  if (!batch || batch.status !== 'APPLIED') return null;

  const limitations: string[] = [];

  const createdAgg = await prisma.salesEntryImportBatchLine.aggregate({
    where: { batchId, action: 'CREATED', salesEntryId: { not: null } },
    _count: true,
    _sum: { amountAfter: true },
  });

  const linesToDelete = createdAgg._count;
  const totalSarRemoved = createdAgg._sum.amountAfter ?? 0;

  const linesToRestore = await prisma.salesEntryImportBatchLine.count({
    where: { batchId, action: 'UPDATED' },
  });

  const updatedSnapshots = await prisma.salesEntryImportBatchLine.findMany({
    where: {
      batchId,
      action: 'UPDATED',
      amountBefore: { not: null },
      amountAfter: { not: null },
    },
    select: { amountBefore: true, amountAfter: true },
  });
  let totalSarRestoredDelta = 0;
  for (const l of updatedSnapshots) {
    if (l.amountBefore != null && l.amountAfter != null) {
      totalSarRestoredDelta += l.amountBefore - l.amountAfter;
    }
  }

  const sampleLineIds = (
    await prisma.salesEntryImportBatchLine.findMany({
      where: { batchId, action: { in: ['CREATED', 'UPDATED'] } },
      select: { id: true },
      take: 5,
      orderBy: { id: 'asc' },
    })
  ).map((l) => l.id);

  const hasUpdatedWithoutSnapshot = await prisma.salesEntryImportBatchLine.count({
    where: {
      batchId,
      action: 'UPDATED',
      OR: [{ amountBefore: null }, { sourceBefore: null }],
    },
  });
  if (hasUpdatedWithoutSnapshot > 0) {
    limitations.push(
      `${hasUpdatedWithoutSnapshot} UPDATED line(s) lack full before snapshot; rollback may skip restore for those rows.`
    );
  }

  return {
    batchId: batch.id,
    fileName: batch.fileName,
    uploadedAt: batch.uploadedAt.toISOString(),
    status: batch.status,
    linesToDelete,
    linesToRestore,
    totalSarRemoved,
    totalSarRestoredDelta,
    limitations,
    sampleLineIds,
  };
}

export type RollbackResult = {
  deletedEntries: number;
  restoredEntries: number;
  skippedConflicts: number;
  messages: string[];
};

export async function executeSalesEntryImportRollback(
  batchId: string,
  actorUserId: string
): Promise<RollbackResult> {
  void actorUserId; // reserved for future audit log of who rolled back
  const batch = await prisma.salesEntryImportBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) {
    return { deletedEntries: 0, restoredEntries: 0, skippedConflicts: 0, messages: ['Batch not found'] };
  }
  if (batch.status !== 'APPLIED') {
    return {
      deletedEntries: 0,
      restoredEntries: 0,
      skippedConflicts: 0,
      messages: [`Batch status is ${batch.status}; only APPLIED batches can be rolled back.`],
    };
  }

  const lines = await prisma.salesEntryImportBatchLine.findMany({
    where: { batchId },
  });

  const messages: string[] = [];
  let deletedEntries = 0;
  let restoredEntries = 0;
  let skippedConflicts = 0;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const line of lines) {
      if (line.action === 'CREATED' && line.salesEntryId) {
        const row = await tx.salesEntry.findUnique({
          where: { id: line.salesEntryId },
          select: { id: true, entryImportBatchId: true },
        });
        if (!row) {
          skippedConflicts += 1;
          continue;
        }
        if (row.entryImportBatchId !== batchId) {
          skippedConflicts += 1;
          messages.push(`Skip delete ${line.salesEntryId}: row touched by another import batch.`);
          continue;
        }
        await tx.salesEntry.delete({ where: { id: line.salesEntryId } });
        deletedEntries += 1;
      } else if (line.action === 'UPDATED' && line.salesEntryId) {
        if (line.amountBefore == null) {
          skippedConflicts += 1;
          messages.push(`Skip restore ${line.salesEntryId}: no amountBefore snapshot.`);
          continue;
        }
        const row = await tx.salesEntry.findUnique({
          where: { id: line.salesEntryId },
          select: { id: true, amount: true, entryImportBatchId: true },
        });
        if (!row) {
          skippedConflicts += 1;
          continue;
        }
        if (line.amountAfter != null && row.amount !== line.amountAfter) {
          skippedConflicts += 1;
          messages.push(
            `Skip restore ${line.salesEntryId}: current amount ${row.amount} ≠ expected after-import ${line.amountAfter}.`
          );
          continue;
        }
        await tx.salesEntry.update({
          where: { id: line.salesEntryId },
          data: {
            amount: line.amountBefore,
            source: line.sourceBefore ?? undefined,
            entryImportBatchId: null,
            updatedAt: new Date(),
          },
        });
        restoredEntries += 1;
      }
    }

    await tx.salesEntryImportBatch.update({
      where: { id: batchId },
      data: { status: 'ROLLED_BACK' },
    });
  });

  return { deletedEntries, restoredEntries, skippedConflicts, messages };
}
