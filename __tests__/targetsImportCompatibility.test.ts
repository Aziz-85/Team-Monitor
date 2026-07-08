/**
 * Permanent compatibility test: generated boutique target templates must
 * round-trip through preview (dry run) and apply without manual edits.
 */

import ExcelJS from 'exceljs';
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

function setTargetOnRow(buffer: Buffer, excelRow: number, target: number | string): Buffer {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheet = workbook.Sheets[BOUTIQUE_SHEET];
  const cell = XLSX.utils.encode_cell({ r: excelRow - 1, c: targetColumnIndex() });
  if (typeof target === 'number') {
    sheet[cell] = { t: 'n', v: target };
  } else {
    sheet[cell] = { t: 's', v: target };
  }
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

async function withAccountingZeroRows(buffer: Buffer, excelRows: number[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(BOUTIQUE_SHEET)!;
  for (const row of excelRows) {
    const cell = sheet.getRow(row).getCell(targetColumnIndex() + 1);
    cell.value = 0;
    cell.numFmt = '#,##0_);(#,##0);-_)';
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
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
  it('fresh downloaded template dry run returns previewRows for all parsed rows', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });

    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.previewRows).toHaveLength(12);
    expect(preview.previewTotals.skipped).toBe(12);
    expect(preview.previewTotals.willInsert).toBe(0);
    expect(preview.previewRows.every((row) => row.action === 'SKIPPED' && row.reason === 'Zero target')).toBe(true);
  });

  it('only edited month inserts while other zero months are skipped', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });
    const filled = setTargetOnRow(buffer, 2, 2_200_000);

    const preview = await parseAndValidateBoutiques(filled, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.previewTotals.willInsert).toBe(1);
    expect(preview.previewTotals.skipped).toBe(11);
    expect(preview.previewRows.find((row) => row.month === '2026-07')?.action).toBe('INSERT');
    expect(preview.previewRows.filter((row) => row.action === 'SKIPPED')).toHaveLength(11);
  });

  it('accepts 2200000, 0, "0", and "2,200,000" with explicit preview actions', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });
    let filled = setTargetOnRow(buffer, 2, 2_200_000);
    filled = setTargetOnRow(filled, 3, 0);
    filled = setTargetOnRow(filled, 4, '0');
    filled = setTargetOnRow(filled, 5, '2,200,000');

    const preview = await parseAndValidateBoutiques(filled, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.previewRows).toHaveLength(12);
    expect(preview.previewRows.find((row) => row.month === '2026-07')?.action).toBe('INSERT');
    expect(preview.previewRows.find((row) => row.month === '2026-08')?.action).toBe('SKIPPED');
    expect(preview.previewRows.find((row) => row.month === '2026-09')?.action).toBe('SKIPPED');
    expect(preview.previewRows.find((row) => row.month === '2026-10')?.action).toBe('INSERT');
  });

  it('apply uses the same write plan as dry run preview', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });
    const filled = setTargetOnRow(buffer, 2, 2_200_000);
    const preview = await parseAndValidateBoutiques(filled, [DHAHRAN.id]);

    const result = await applyBoutiquesImport(
      { inserts: preview.inserts, updates: preview.updates },
      'user-1'
    );

    expect(result.inserted).toBe(preview.inserts.length);
    expect(result.updated).toBe(preview.updates.length);
    expect(db.boutiqueMonthlyTarget.create).toHaveBeenCalledTimes(preview.inserts.length);
  });

  it('existing zero target is no change in preview', async () => {
    db.boutiqueMonthlyTarget.findMany.mockResolvedValue([
      { id: 'existing-1', boutiqueId: DHAHRAN.id, month: '2026-07', amount: 0 },
    ]);
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });

    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);
    const july = preview.previewRows.find((row) => row.month === '2026-07');

    expect(july?.action).toBe('NO_CHANGE');
    expect(july?.existingAmount).toBe(0);
    expect(july?.newAmount).toBe(0);
    expect(preview.inserts).toHaveLength(0);
  });

  it('accepts accounting-format zero cells that display as dashes', async () => {
    const buffer = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });
    const accounting = await withAccountingZeroRows(buffer, [3, 4, 5, 6, 7]);

    const preview = await parseAndValidateBoutiques(accounting, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.previewRows.filter((row) => row.action === 'SKIPPED')).toHaveLength(12);
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
    expect(preview.previewRows.find((row) => row.rowNumber === 2)?.action).toBe('ERROR');
  });

  it('skips blank rows at the bottom of the sheet', async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      BOUTIQUE_HEADERS,
      ['2026-07', '03', 'Dhahran', 2_200_000, 'OFFICIAL', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, BOUTIQUE_SHEET);
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);

    expect(preview.previewRows).toHaveLength(1);
    expect(preview.previewRows[0].action).toBe('INSERT');
  });
});
