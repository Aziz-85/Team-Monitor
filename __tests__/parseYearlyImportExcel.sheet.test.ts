import { isYearlyImportSheetName, parseYearlyImportExcel } from '@/lib/sales/parseYearlyImportExcel';
import * as XLSX from 'xlsx';

describe('yearly import Excel sheet naming', () => {
  it('accepts Import_YYYY only', () => {
    expect(isYearlyImportSheetName('Import_2026')).toBe(true);
    expect(isYearlyImportSheetName(' import_1999 ')).toBe(true);
    expect(isYearlyImportSheetName('Import_26')).toBe(false);
    expect(isYearlyImportSheetName('Import_20266')).toBe(false);
    expect(isYearlyImportSheetName('Data')).toBe(false);
  });

  it('parses minimal workbook when Import_YYYY exists', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'emp_1'],
      ['2026-01-01', 100],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Import_2026');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const r = parseYearlyImportExcel(buf);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows.length).toBe(1);
      expect(r.rows[0].values[0]).toEqual({ empId: '1', amountSar: 100 });
    }
  });

  it('fails when no Import_YYYY sheet', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['Date'], ['2026-01-01']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Wrong');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const r = parseYearlyImportExcel(buf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Import_YYYY/i);
  });
});
