/**
 * Permanent compatibility test: generated boutique target templates must
 * round-trip through preview (dry run) and apply without manual edits.
 */

import * as XLSX from 'xlsx';

const db = {
  boutique: { findMany: jest.fn() },
  boutiqueMonthlyTarget: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};
jest.mock('@/lib/db', () => ({ prisma: db }));

import { buildBoutiqueTargetsImportTemplate } from '@/lib/targets/buildBoutiqueAwareTemplates';
import {
  applyBoutiquesImport,
  parseAndValidateBoutiques,
} from '@/lib/targets/importBoutiques';
import { BOUTIQUE_HEADERS, BOUTIQUE_SHEET } from '@/lib/targets/templates';

const DHAHRAN = { id: 'b-dhahran', code: '03', name: 'Dhahran' };

function targetColumnIndex(): number {
  return BOUTIQUE_HEADERS.indexOf('Target');
}

function setTargetOnRow(buffer: Buffer, excelRow: number, target: number): Buffer {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheet = workbook.Sheets[BOUTIQUE_SHEET];
  const cell = XLSX.utils.encode_cell({ r: excelRow - 1, c: targetColumnIndex() });
  sheet[cell] = { t: 'n', v: target };
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  db.boutique.findMany.mockResolvedValue([
    { id: DHAHRAN.id, code: DHAHRAN.code, name: DHAHRAN.name },
  ]);
  db.boutiqueMonthlyTarget.findMany.mockResolvedValue([]);
  db.boutiqueMonthlyTarget.create.mockResolvedValue({ id: 't1' });
  db.boutiqueMonthlyTarget.update.mockResolvedValue({ id: 't1' });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
});

describe('boutique target template import compatibility', () => {
  it('fresh downloaded template passes dry run with zero validation errors', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });

    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.targetFormatErrors).toBe(0);
    expect(preview.inserts).toHaveLength(0);
    expect(preview.updates).toHaveLength(0);
  });

  it('fresh downloaded template applies successfully with no rows to write', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });

    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);
    expect(preview.invalidRows).toHaveLength(0);

    const result = await applyBoutiquesImport(preview, 'user-1');
    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(db.boutiqueMonthlyTarget.create).not.toHaveBeenCalled();
  });

  it('filled template round-trips: dry run then confirm apply succeeds', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });
    const filled = setTargetOnRow(buffer, 2, 2_200_000);
    const withZero = setTargetOnRow(filled, 3, 0);
    const withAnother = setTargetOnRow(withZero, 4, 150_000);

    const preview = await parseAndValidateBoutiques(withAnother, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.inserts).toHaveLength(3);
    expect(preview.inserts.map((row) => row.target).sort((a, b) => a - b)).toEqual([0, 150_000, 2_200_000]);

    const result = await applyBoutiquesImport(preview, 'user-1');
    expect(result.inserted).toBe(3);
    expect(result.updated).toBe(0);
    expect(db.boutiqueMonthlyTarget.create).toHaveBeenCalledTimes(3);
  });

  it('rejects non-numeric target values', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    const sheet = workbook.Sheets[BOUTIQUE_SHEET];
    const cell = XLSX.utils.encode_cell({ r: 1, c: targetColumnIndex() });
    sheet[cell] = { t: 's', v: 'not-a-number' };
    const invalidBuffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

    const preview = await parseAndValidateBoutiques(invalidBuffer, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(1);
    expect(preview.invalidRows[0].message).toBe('Target must be a number');
  });

  it('parses rows by header names regardless of column order', async () => {
    const workbook = XLSX.utils.book_new();
    const reorderedHeaders = ['Target', 'Notes', 'Month', 'ScopeId', 'BoutiqueName', 'Source'];
    const rows = [
      reorderedHeaders,
      [2_200_000, '', '2026-07', '03', 'Dhahran', 'OFFICIAL'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, BOUTIQUE_SHEET);
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.inserts).toHaveLength(1);
    expect(preview.inserts[0].target).toBe(2_200_000);
  });
});
