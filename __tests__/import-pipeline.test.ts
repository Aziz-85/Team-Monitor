/**
 * Phase 4 import pipeline regression tests.
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

import { computeImportFileSha256, importFileHashesMatch } from '@/lib/imports/fileHash';
import { importScopeKeyForBoutique, importScopeKeyForBoutiqueSet } from '@/lib/imports/scopeKey';
import { validateImportUpload, TARGETS_EXCEL_UPLOAD } from '@/lib/imports/validateUpload';
import {
  assertImportApplyAllowed,
  canForceImportReprocess,
} from '@/lib/imports/confirm';
import { findImportDuplicate } from '@/lib/imports/duplicate';

describe('import file hash', () => {
  it('computes stable SHA-256 for identical buffers', () => {
    const buffer = Buffer.from('sample-targets-sheet');
    const a = computeImportFileSha256(buffer);
    const b = computeImportFileSha256(buffer);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('matches hashes case-insensitively', () => {
    const hash = computeImportFileSha256(Buffer.from('x'));
    expect(importFileHashesMatch(hash, hash.toUpperCase())).toBe(true);
    expect(importFileHashesMatch(hash, hash + '0')).toBe(false);
  });
});

describe('import scope keys', () => {
  it('uses boutique prefix for single boutique', () => {
    expect(importScopeKeyForBoutique('b1')).toBe('boutique:b1');
  });

  it('hashes multi-boutique scope deterministically', () => {
    const a = importScopeKeyForBoutiqueSet(['b2', 'b1']);
    const b = importScopeKeyForBoutiqueSet(['b1', 'b2']);
    expect(a).toBe(b);
    expect(a.startsWith('boutiques:')).toBe(true);
  });
});

describe('validateImportUpload', () => {
  it('rejects unsupported extensions', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'targets.csv', {
      type: 'text/csv',
    });
    const result = await validateImportUpload(file, TARGETS_EXCEL_UPLOAD);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Allowed file types/i);
  });

  it('accepts xlsx uploads within size limit', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'targets.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = await validateImportUpload(file, TARGETS_EXCEL_UPLOAD);
    expect(result.ok).toBe(true);
  });
});

describe('duplicate import detection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns unified fingerprint when ImportFileRecord is APPLIED', async () => {
    db.importFileRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      originalFileName: 'targets.xlsx',
      uploadedAt: new Date('2026-07-01T00:00:00.000Z'),
      uploadedById: 'user-1',
      status: 'APPLIED',
      batchId: null,
      batchEntityType: null,
      uploadedBy: { employee: { name: 'Manager One' } },
    });

    const dup = await findImportDuplicate({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      fileSha256: 'abc123',
    });

    expect(dup?.recordId).toBe('rec-1');
    expect(dup?.uploadedByName).toBe('Manager One');
  });
});

describe('import apply gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.importFileRecord.findUnique.mockResolvedValue({
      id: 'rec-applied',
      originalFileName: 'targets.xlsx',
      uploadedAt: new Date(),
      uploadedById: 'user-1',
      status: 'APPLIED',
      batchId: null,
      batchEntityType: null,
      uploadedBy: { employee: { name: 'Manager' } },
    });
    db.salesEntryImportBatch.findFirst.mockResolvedValue(null);
    db.salesLedgerBatch.findFirst.mockResolvedValue(null);
  });

  it('blocks duplicate apply for managers', async () => {
    const gate = await assertImportApplyAllowed({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      fileSha256: 'abc123',
      actorUserId: 'manager-1',
      actorRole: 'MANAGER',
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe('DUPLICATE_FILE');
  });

  it('allows admin force reprocess with audit', async () => {
    expect(canForceImportReprocess('ADMIN')).toBe(true);
    db.auditLog.create.mockResolvedValue({});

    const gate = await assertImportApplyAllowed({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      fileSha256: 'abc123',
      forceReprocess: true,
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      auditBoutiqueId: 'b1',
    });

    expect(gate.allowed).toBe(true);
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it('requires fileSha256 on apply', async () => {
    const gate = await assertImportApplyAllowed({
      importType: 'TARGETS_BOUTIQUE',
      scopeKey: 'boutique:b1',
      fileSha256: '',
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe('MISSING_HASH');
  });
});
