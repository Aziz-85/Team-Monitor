/**
 * Yearly employee sales import — boutique-owned writes, validation warnings, apply path.
 */

import * as XLSX from 'xlsx';

const BOUTIQUE_DHAHRAN = 'boutique-dhahran';
const BOUTIQUE_OTHER = 'boutique-other';
const USER_1101 = 'user-1101';
const USER_2011 = 'user-2011';

const db = {
  boutique: { findUnique: jest.fn() },
  employee: { findMany: jest.fn(), findUnique: jest.fn() },
  employeeAssignment: { findMany: jest.fn() },
  salesEntry: { findMany: jest.fn() },
  salesEntryImportBatch: { create: jest.fn() },
  salesEntryImportBatchLine: { create: jest.fn() },
  boutiqueSalesSummary: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  boutiqueSalesLine: { upsert: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/lib/db', () => ({ prisma: db }));

jest.mock('@/lib/sales/syncDailyLedgerToSalesEntry', () => ({
  syncDailyLedgerToSalesEntry: jest.fn(),
}));

jest.mock('@/lib/sales/audit', () => ({
  recordSalesLedgerAudit: jest.fn(),
}));

import { parseYearlyImportReadme } from '@/lib/sales/parseYearlyImportReadme';
import { parseYearlyImportExcel, parseAmountSarInt } from '@/lib/sales/parseYearlyImportExcel';
import {
  applyYearlyEmployeeSalesImportPlan,
  buildYearlyEmployeeSalesImportPlan,
} from '@/lib/sales/yearlyEmployeeSalesImport';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';

const syncMock = syncDailyLedgerToSalesEntry as jest.Mock;

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

function defaultEmployees() {
  return [
    {
      empId: '1101',
      name: 'Sara',
      boutiqueId: BOUTIQUE_DHAHRAN,
      isSystemOnly: false,
      user: { id: USER_1101 },
      boutique: { id: BOUTIQUE_DHAHRAN, name: 'Dhahran' },
    },
    {
      empId: '2011',
      name: 'Omar',
      boutiqueId: BOUTIQUE_DHAHRAN,
      isSystemOnly: false,
      user: { id: USER_2011 },
      boutique: { id: BOUTIQUE_DHAHRAN, name: 'Dhahran' },
    },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  db.boutique.findUnique.mockResolvedValue({ id: BOUTIQUE_DHAHRAN, name: 'Dhahran' });
  db.employee.findMany.mockResolvedValue(defaultEmployees());
  db.employee.findUnique.mockImplementation(({ where }: { where: { empId?: string } }) => {
    const emp = defaultEmployees().find((e) => e.empId === where.empId);
    if (!emp) return Promise.resolve(null);
    return Promise.resolve({
      boutiqueId: emp.boutiqueId,
      active: true,
      isSystemOnly: emp.isSystemOnly,
      boutique: emp.boutique,
      user: { id: emp.user.id, boutiqueId: emp.boutiqueId },
    });
  });
  db.employeeAssignment.findMany.mockResolvedValue([]);
  db.salesEntry.findMany.mockResolvedValue([]);
  db.salesEntryImportBatch.create.mockResolvedValue({ id: 'batch-1' });
  db.salesEntryImportBatchLine.create.mockResolvedValue({ id: 'line-1' });
  db.boutiqueSalesSummary.findUnique.mockResolvedValue(null);
  db.boutiqueSalesSummary.create.mockResolvedValue({
    id: 'summary-1',
    status: 'DRAFT',
    totalSar: 0,
    lines: [],
  });
  db.boutiqueSalesSummary.update.mockResolvedValue({});
  db.boutiqueSalesLine.upsert.mockResolvedValue({});
  db.boutiqueSalesLine.findMany.mockResolvedValue([{ amountSar: 100 }]);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  syncMock.mockResolvedValue({ ok: true, upserted: 1, skipped: 0, precedenceRejected: 0 });
});

describe('parseYearlyImportReadme', () => {
  it('reads boutique metadata from README sheet', () => {
    const buf = buildYearlyWorkbook([['Date', 'emp_1101'], ['2026-01-01', 100]], {
      readme: [
        ['boutiqueId', BOUTIQUE_DHAHRAN],
        ['boutiqueCode', '03'],
        ['boutiqueName', 'Dhahran'],
        ['year', '2026'],
      ],
    });
    const meta = parseYearlyImportReadme(buf);
    expect(meta.boutiqueId).toBe(BOUTIQUE_DHAHRAN);
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
  it('writes all rows to uploaded Dhahran boutique', async () => {
    const buf = buildYearlyWorkbook(
      [
        ['Date', 'emp_1101', 'emp_2011'],
        ['2026-01-05', 100, 200],
        ['2026-07-20', 300, 400],
      ],
      { readme: [['boutiqueId', BOUTIQUE_DHAHRAN], ['year', '2026']] }
    );

    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'sales-import-template-yearly-s05-2026.xlsx',
    });

    expect(plan.boutiqueMismatch).toBeNull();
    expect(plan.previewTotals.inserts).toBe(4);
    expect(plan.previewRows.every((r) => r.uploadedBoutiqueId === BOUTIQUE_DHAHRAN)).toBe(true);
    expect(plan.previewRows.some((r) => r.saleDate === '2026-01-05')).toBe(true);
    expect(plan.canApply).toBe(true);
    expect(plan.applyPlan.boutiqueId).toBe(BOUTIQUE_DHAHRAN);
    expect(plan.applyPlan.writes).toHaveLength(4);
  });

  it('warns when EmployeeAssignment boutique differs but keeps uploaded boutique', async () => {
    db.employeeAssignment.findMany.mockResolvedValue([
      {
        boutiqueId: BOUTIQUE_OTHER,
        boutique: { id: BOUTIQUE_OTHER, name: 'Other Boutique' },
      },
    ]);

    const buf = buildYearlyWorkbook([['Date', 'emp_1101'], ['2026-01-01', 500]]);
    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'test.xlsx',
    });

    const row = plan.previewRows[0]!;
    expect(row.action).toBe('INSERT');
    expect(row.uploadedBoutiqueId).toBe(BOUTIQUE_DHAHRAN);
    expect(row.historicalBoutiqueId).toBe(BOUTIQUE_OTHER);
    expect(row.warnings.some((w) => w.includes('assigned to another boutique'))).toBe(true);
    expect(plan.applyPlan.writes[0]?.dateKey).toBe('2026-01-01');
  });

  it('warns when Employee.boutiqueId differs from uploaded boutique', async () => {
    db.employee.findMany.mockResolvedValue([
      {
        empId: '1101',
        name: 'Sara',
        boutiqueId: BOUTIQUE_OTHER,
        isSystemOnly: false,
        user: { id: USER_1101 },
        boutique: { id: BOUTIQUE_OTHER, name: 'Other Boutique' },
      },
    ]);
    db.employee.findUnique.mockResolvedValue({
      boutiqueId: BOUTIQUE_OTHER,
      boutique: { id: BOUTIQUE_OTHER, name: 'Other Boutique' },
    });

    const buf = buildYearlyWorkbook([['Date', 'emp_1101'], ['2026-01-01', 100]]);
    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'test.xlsx',
    });

    const row = plan.previewRows[0]!;
    expect(row.action).toBe('INSERT');
    expect(row.warnings.some((w) => w.includes('current boutique differs'))).toBe(true);
    expect(plan.canApply).toBe(true);
  });

  it('flags duplicate employee/date in file as ERROR', async () => {
    const buf = buildYearlyWorkbook([
      ['Date', 'emp_1101'],
      ['2026-01-01', 100],
      ['2026-01-01', 200],
    ]);
    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'dup.xlsx',
    });

    const dup = plan.previewRows.find((r) => r.action === 'ERROR');
    expect(dup?.warnings).toContain('Duplicate employee/date in file');
    expect(plan.applyPlan.writes).toHaveLength(1);
  });

  it('warns when employee already has sales under another boutique on same date', async () => {
    db.salesEntry.findMany.mockImplementation(async (args: { where?: { boutiqueId?: unknown } }) => {
      if (args.where?.boutiqueId && typeof args.where.boutiqueId === 'object' && 'not' in args.where.boutiqueId) {
        return [{ userId: USER_1101, dateKey: '2026-01-01', boutiqueId: BOUTIQUE_OTHER }];
      }
      return [];
    });

    const buf = buildYearlyWorkbook([['Date', 'emp_1101'], ['2026-01-01', 100]]);
    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'cross.xlsx',
    });

    expect(
      plan.previewRows[0]?.warnings.some((w) => w.includes('another boutique on this date'))
    ).toBe(true);
  });

  it('rejects file when README boutiqueId mismatches operational boutique', async () => {
    const buf = buildYearlyWorkbook([['Date', 'emp_1101'], ['2026-01-01', 500]], {
      readme: [['boutiqueId', 'other-boutique']],
    });
    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'wrong.xlsx',
    });
    expect(plan.boutiqueMismatch).toMatch(/does not match/);
    expect(plan.canApply).toBe(false);
  });

  it('marks unknown employees as invalid without blocking valid rows', async () => {
    const buf = buildYearlyWorkbook([
      ['Date', 'emp_1101', 'emp_9999'],
      ['2026-01-01', 100, 500],
    ]);
    db.employee.findMany.mockResolvedValue([defaultEmployees()[0]]);

    const plan = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'test.xlsx',
    });

    expect(plan.previewTotals.unmappedEmployees).toContain('9999');
    expect(plan.previewRows.find((r) => r.empId === '9999')?.action).toBe('ERROR');
    expect(plan.applyPlan.writes).toHaveLength(1);
  });
});

describe('applyYearlyEmployeeSalesImportPlan', () => {
  it('writes ledger lines and syncs SalesEntry under uploaded boutique', async () => {
    const buf = buildYearlyWorkbook([
      ['Date', 'emp_1101'],
      ['2026-01-01', 100],
      ['2026-06-15', 200],
    ]);
    const dry = await buildYearlyEmployeeSalesImportPlan({
      buffer: buf,
      boutiqueId: BOUTIQUE_DHAHRAN,
      fileName: 'yearly.xlsx',
    });

    const result = await applyYearlyEmployeeSalesImportPlan({
      plan: dry.applyPlan,
      actorUserId: 'admin-1',
    });

    expect(result.inserted).toBe(2);
    expect(db.boutiqueSalesLine.upsert).toHaveBeenCalledTimes(2);
    expect(db.boutiqueSalesLine.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          employeeId: '1101',
          source: 'YEARLY_IMPORT',
        }),
      })
    );
    expect(syncMock).toHaveBeenCalledTimes(2);
    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boutiqueId: BOUTIQUE_DHAHRAN,
        sourceOverride: 'YEARLY_IMPORT',
      })
    );
    expect(db.salesEntryImportBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'YEARLY_IMPORT',
          importMode: 'yearly-employee-boutique-owned',
        }),
      })
    );
  });
});
