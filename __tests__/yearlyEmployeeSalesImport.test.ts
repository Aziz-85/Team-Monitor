/**
 * Yearly employee sales import — parser, dry-run, and apply plan tests.
 */

import * as XLSX from 'xlsx';

const BOUTIQUE_ID = 'boutique-b1';
const USER_1101 = 'user-1101';
const USER_2011 = 'user-2011';

const db = {
  employee: { findMany: jest.fn() },
  salesEntry: { findMany: jest.fn() },
  salesEntryImportBatch: { create: jest.fn() },
  salesEntryImportBatchLine: { create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/lib/db', () => ({ prisma: db }));

jest.mock('@/lib/sales/upsertSalesEntry', () => ({
  upsertCanonicalSalesEntry: jest.fn(),
}));

import { parseYearlyImportReadme } from '@/lib/sales/parseYearlyImportReadme';
import { parseYearlyImportExcel, parseAmountSarInt } from '@/lib/sales/parseYearlyImportExcel';
import {
  applyYearlyEmployeeSalesImportPlan,
  buildYearlyEmployeeSalesImportPlan,
} from '@/lib/sales/yearlyEmployeeSalesImport';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';

const upsertMock = upsertCanonicalSalesEntry as jest.Mock;

function buildYearlyWorkbook(
  rows: unknown[][],
  opts?: { readme?: unknown[][]; sheetName?: string }
): Buffer {
  const wb = XLSX.utils.book_new();
  const sheetName = opts?.sheetName ?? 'Import_2026';
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  if (opts?.readme) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opts.readme), 'README');
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  db.employee.findMany.mockResolvedValue([
    { empId: '1101', name: 'Sara', isSystemOnly: false, user: { id: USER_1101 } },
    { empId: '2011', name: 'Omar', isSystemOnly: false, user: { id: USER_2011 } },
  ]);
  db.salesEntry.findMany.mockResolvedValue([]);
  db.salesEntryImportBatch.create.mockResolvedValue({ id: 'batch-1' });
  db.salesEntryImportBatchLine.create.mockResolvedValue({ id: 'line-1' });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  upsertMock.mockResolvedValue({ status: 'created', salesEntryId: 'se-1', signals: {} });
});

describe('parseYearlyImportReadme', () => {
  it('reads boutique metadata from README sheet', () => {
    const buf = buildYearlyWorkbook([['Date', 'emp_1101'], ['2026-01-01', 100]], {
      readme: [
        ['boutiqueId', BOUTIQUE_ID],
        ['boutiqueCode', '03'],
        ['boutiqueName', 'Dhahran'],
        ['year', '2026'],
      ],
    });
    const meta = parseYearlyImportReadme(buf);
    expect(meta.boutiqueId).toBe(BOUTIQUE_ID);
    expect(meta.boutiqueCode).toBe('03');
    expect(meta.boutiqueName).toBe('Dhahran');
    expect(meta.year).toBe('2026');
  });
});

describe('parseYearlyImportExcel', () => {
  it('parses Import_2026 sheet with Date and emp columns', () => {
    const buf = buildYearlyWorkbook([
      ['Date', 'emp_1101', 'emp_2011'],
      ['2026-01-15', 1000, ''],
      ['2026-02-10', '', 2500],
    ]);
    const r = parseYearlyImportExcel(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.employeeColumns.map((c) => c.empId)).toEqual(['1101', '2011']);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.dateKey).toBe('2026-01-15');
    expect(r.rows[0]?.values).toEqual([{ empId: '1101', amountSar: 1000 }]);
    expect(r.rows[1]?.values).toEqual([{ empId: '2011', amountSar: 2500 }]);
    expect(r.skippedEmpty).toBeGreaterThan(0);
  });

  it('skips blank cells and accepts explicit zero', () => {
    expect(parseAmountSarInt('')).toEqual({ ok: true, skip: true });
    expect(parseAmountSarInt(0)).toEqual({ ok: true, value: 0 });
    const buf = buildYearlyWorkbook([
      ['Date', 'emp_1101'],
      ['2026-03-01', 0],
      ['2026-03-02', ''],
    ]);
    const r = parseYearlyImportExcel(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.values[0]?.amountSar).toBe(0);
    expect(r.skippedEmpty).toBeGreaterThan(0);
  });
});

describe('buildYearlyEmployeeSalesImportPlan', () => {
  it('dry run shows preview rows for multiple months', async () => {
    const buf = buildYearlyWorkbook(
      [
        ['Date', 'emp_1101', 'emp_2011'],
        ['2026-01-05', 100, 200],
        ['2026-07-20', 300, 400],
      ],
      {
        readme: [['boutiqueId', BOUTIQUE_ID], ['year', '2026']],
      }
    );

    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_ID,
      fileName: 'sales-import-template-yearly-s05-2026.xlsx',
    });

    expect(plan.boutiqueMismatch).toBeNull();
    expect(plan.previewTotals.totalRows).toBe(2);
    expect(plan.previewTotals.inserts).toBe(4);
    expect(plan.previewRows).toHaveLength(4);
    expect(plan.previewRows.some((r) => r.dateKey === '2026-01-05')).toBe(true);
    expect(plan.previewRows.some((r) => r.dateKey === '2026-07-20')).toBe(true);
    expect(plan.canApply).toBe(true);
    expect(plan.applyPlan.writes).toHaveLength(4);
  });

  it('rejects file when README boutiqueId mismatches operational boutique', async () => {
    const buf = buildYearlyWorkbook([['Date', 'emp_1101'], ['2026-01-01', 500]], {
      readme: [['boutiqueId', 'other-boutique']],
    });
    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_ID,
      fileName: 'wrong.xlsx',
    });
    expect(plan.boutiqueMismatch).toMatch(/does not match/);
    expect(plan.canApply).toBe(false);
  });

  it('marks employees outside boutique as invalid', async () => {
    const buf = buildYearlyWorkbook([
      ['Date', 'emp_1101', 'emp_9999'],
      ['2026-01-01', 100, 500],
    ]);
    db.employee.findMany.mockResolvedValue([
      { empId: '1101', name: 'Sara', isSystemOnly: false, user: { id: USER_1101 } },
    ]);

    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_ID,
      fileName: 'test.xlsx',
    });

    expect(plan.previewTotals.unmappedEmployees).toContain('9999');
    expect(plan.previewRows.find((r) => r.empId === '9999')?.action).toBe('ERROR');
    expect(plan.applyPlan.writes).toHaveLength(1);
  });
});

describe('applyYearlyEmployeeSalesImportPlan', () => {
  it('writes all planned cells via upsertCanonicalSalesEntry', async () => {
    const buf = buildYearlyWorkbook([
      ['Date', 'emp_1101'],
      ['2026-01-01', 100],
      ['2026-06-15', 200],
    ]);
    const dry = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_ID,
      fileName: 'yearly.xlsx',
    });

    const result = await applyYearlyEmployeeSalesImportPlan({
      plan: dry.applyPlan,
      actorUserId: 'admin-1',
    });

    expect(result.inserted).toBe(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(db.salesEntryImportBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'EXCEL_YEARLY_IMPORT',
          importMode: 'yearly-employee',
        }),
      })
    );
  });
});
