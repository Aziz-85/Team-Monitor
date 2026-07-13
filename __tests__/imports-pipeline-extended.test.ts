/**
 * Phase 7 — extended import pipeline coverage (preview orchestration + apply gate edges).
 */

const db = {
  importFileRecord: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  salesEntryImportBatch: { findFirst: jest.fn() },
  salesLedgerBatch: { findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock('@/lib/db', () => ({ prisma: db }));

import { runImportPreview } from '@/lib/imports/pipeline';
import { assertImportApplyAllowed } from '@/lib/imports/confirm';
import { markImportApplied } from '@/lib/imports/duplicate';
import { TARGETS_EXCEL_UPLOAD } from '@/lib/imports/validateUpload';

describe('runImportPreview orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.importFileRecord.findUnique.mockResolvedValue(null);
    db.salesEntryImportBatch.findFirst.mockResolvedValue(null);
    db.salesLedgerBatch.findFirst.mockResolvedValue(null);
    db.importFileRecord.upsert.mockResolvedValue({ id: 'rec-1' });
  });

  it('returns validation error for missing file', async () => {
    const result = await runImportPreview({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      uploadedById: 'u1',
      file: null,
      validate: TARGETS_EXCEL_UPLOAD,
      parse: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('blocks apply when canApply returns false', async () => {
    const file = new File([Buffer.from('fake-xlsx')], 'targets.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = await runImportPreview({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      uploadedById: 'u1',
      file,
      validate: TARGETS_EXCEL_UPLOAD,
      parse: async () => ({ rows: 0 }),
      canApply: () => false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.applyBlockedByDuplicate).toBe(true);
    expect(db.importFileRecord.upsert).toHaveBeenCalled();
  });
});

describe('assertImportApplyAllowed edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.importFileRecord.findUnique.mockResolvedValue(null);
    db.salesEntryImportBatch.findFirst.mockResolvedValue(null);
    db.auditLog.create.mockResolvedValue({});
  });

  it('rejects hash mismatch when fileBuffer provided', async () => {
    const hash = 'a'.repeat(64);
    const gate = await assertImportApplyAllowed({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      fileSha256: hash,
      actorUserId: 'u1',
      actorRole: 'MANAGER',
      fileBuffer: Buffer.from('different-bytes'),
    });
    expect(gate.allowed).toBe(false);
    if (gate.allowed) return;
    expect(gate.reason).toBe('HASH_MISMATCH');
  });
});

describe('markImportApplied', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.importFileRecord.updateMany.mockResolvedValue({ count: 1 });
  });

  it('updates ImportFileRecord status to APPLIED', async () => {
    await markImportApplied({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      fileSha256: 'b'.repeat(64),
    });
    expect(db.importFileRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPLIED' }),
      })
    );
  });
});
