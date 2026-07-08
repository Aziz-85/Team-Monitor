/**
 * Regression: boutique target import must apply every valid month row in the file.
 */

import * as XLSX from 'xlsx';
import { BOUTIQUE_HEADERS, BOUTIQUE_SHEET } from '@/lib/targets/templates';

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

import {
  applyBoutiquesImport,
  parseAndValidateBoutiques,
} from '@/lib/targets/importBoutiques';

const DHAHRAN = { id: 'b-dhahran', code: '03', name: 'Dhahran' };

const MONTHS_JAN_TO_JUL = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
] as const;

const TARGETS_BY_MONTH: Record<(typeof MONTHS_JAN_TO_JUL)[number], number> = {
  '2026-01': 1_100_000,
  '2026-02': 1_200_000,
  '2026-03': 1_300_000,
  '2026-04': 1_400_000,
  '2026-05': 1_500_000,
  '2026-06': 1_600_000,
  '2026-07': 1_700_000,
};

function buildSevenMonthWorkbook(): Buffer {
  const rows: unknown[][] = [BOUTIQUE_HEADERS];
  for (const month of MONTHS_JAN_TO_JUL) {
    rows.push([month, DHAHRAN.code, DHAHRAN.name, TARGETS_BY_MONTH[month], 'OFFICIAL', '']);
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), BOUTIQUE_SHEET);
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  db.boutique.findMany.mockResolvedValue([
    { id: DHAHRAN.id, code: DHAHRAN.code, name: DHAHRAN.name },
  ]);
  db.boutiqueMonthlyTarget.findMany.mockResolvedValue([]);
  db.boutiqueMonthlyTarget.create.mockImplementation(async ({ data }: { data: { month: string; amount: number } }) => ({
    id: `t-${data.month}`,
    ...data,
  }));
  db.boutiqueMonthlyTarget.update.mockResolvedValue({ id: 't-updated' });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
});

describe('boutique target import — all months in file', () => {
  it('dry run shows 7 previewRows for Jan–Jul with INSERT actions', async () => {
    const buffer = buildSevenMonthWorkbook();
    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);

    expect(preview.invalidRows).toHaveLength(0);
    expect(preview.previewRows).toHaveLength(7);
    expect(preview.previewTotals.willInsert).toBe(7);
    expect(preview.previewTotals.willUpdate).toBe(0);
    expect(preview.previewTotals.errors).toBe(0);

    for (const month of MONTHS_JAN_TO_JUL) {
      const row = preview.previewRows.find((r) => r.month === month);
      expect(row).toBeDefined();
      expect(row?.action).toBe('INSERT');
      expect(row?.newAmount).toBe(TARGETS_BY_MONTH[month]);
    }
  });

  it('confirm apply writes 7 BoutiqueMonthlyTarget rows matching dry run', async () => {
    const buffer = buildSevenMonthWorkbook();
    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);

    const result = await applyBoutiquesImport(
      { inserts: preview.inserts, updates: preview.updates },
      'user-1'
    );

    expect(result.inserted).toBe(7);
    expect(result.updated).toBe(0);
    expect(db.boutiqueMonthlyTarget.create).toHaveBeenCalledTimes(7);

    for (const month of MONTHS_JAN_TO_JUL) {
      expect(db.boutiqueMonthlyTarget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            boutiqueId: DHAHRAN.id,
            month,
            amount: TARGETS_BY_MONTH[month],
          }),
        })
      );
    }
  });

  it('skips zero targets with explicit SKIPPED reason in preview', async () => {
    const rows: unknown[][] = [
      BOUTIQUE_HEADERS,
      ['2026-01', DHAHRAN.code, DHAHRAN.name, 500_000, 'OFFICIAL', ''],
      ['2026-02', DHAHRAN.code, DHAHRAN.name, 0, 'OFFICIAL', ''],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), BOUTIQUE_SHEET);
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

    const preview = await parseAndValidateBoutiques(buffer, [DHAHRAN.id]);

    expect(preview.previewRows.find((r) => r.month === '2026-01')?.action).toBe('INSERT');
    expect(preview.previewRows.find((r) => r.month === '2026-02')?.action).toBe('SKIPPED');
    expect(preview.previewRows.find((r) => r.month === '2026-02')?.reason).toBe('Zero target');
    expect(preview.inserts).toHaveLength(1);
  });
});
