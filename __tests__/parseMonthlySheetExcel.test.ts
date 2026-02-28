/**
 * Monthly sheet parser: robust header discovery (scan up to HEADER_SCAN_ROWS).
 * Ensures header row is detected even when it is not row 6 (e.g. report-style FEB).
 */

import * as XLSX from 'xlsx';
import {
  parseOneMonthlySheet,
  loadEmployeesMap,
  loadEmployeesMapWithIds,
  normalizeCell,
  sheetNameFromMonth,
} from '@/lib/sales/parseMonthlySheetExcel';

function workbookFromRows(sheetName: string, rows: unknown[][]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  return {
    SheetNames: [sheetName],
    Sheets: { [sheetName]: sheet },
  };
}

describe('parseMonthlySheetExcel', () => {
  describe('normalizeCell', () => {
    it('trims, lowercases, and collapses whitespace', () => {
      expect(normalizeCell('  Date  ')).toBe('date');
      expect(normalizeCell('Total  Sales')).toBe('total sales');
    });

    it('removes line breaks', () => {
      expect(normalizeCell('Date\n')).toBe('date');
      expect(normalizeCell('Day\r\n')).toBe('day');
    });
  });

  describe('sheetNameFromMonth', () => {
    it('maps YYYY-MM to sheet name', () => {
      expect(sheetNameFromMonth('2026-02')).toBe('FEB');
      expect(sheetNameFromMonth('2026-03')).toBe('MAR');
    });
  });

  describe('loadEmployeesMap', () => {
    it('returns empty set when sheet does not exist', () => {
      const wb = workbookFromRows('FEB', [['Date'], [1]]);
      expect(loadEmployeesMap(wb).size).toBe(0);
    });

    it('loads Name_in_Data and emp_<id> from Employees_Map sheet', () => {
      const rows = [
        ['empId', 'Name_in_Data'],
        ['E001', 'Ali'],
        ['E002', 'Sara'],
      ];
      const wb = workbookFromRows('FEB', [['Date']]);
      wb.SheetNames.push('Employees_Map');
      wb.Sheets['Employees_Map'] = XLSX.utils.aoa_to_sheet(rows);
      const set = loadEmployeesMap(wb);
      expect(set.has('ali')).toBe(true);
      expect(set.has('sara')).toBe(true);
      expect(set.has('emp_e001')).toBe(true);
      expect(set.has('emp_e002')).toBe(true);
    });

    it('loadEmployeesMapWithIds returns normalized header -> empId map', () => {
      const rows = [
        ['empId', 'Name_in_Data'],
        ['E001', 'Ali'],
      ];
      const wb = workbookFromRows('FEB', [['Date']]);
      wb.SheetNames.push('Employees_Map');
      wb.Sheets['Employees_Map'] = XLSX.utils.aoa_to_sheet(rows);
      const map = loadEmployeesMapWithIds(wb);
      expect(map.get('ali')).toBe('E001');
      expect(map.get('emp_e001')).toBe('E001');
    });
  });

  describe('header row detection (not row 6)', () => {
    it('detects header row when it is on row 0 (first row)', () => {
      const rows = [
        ['Date', 'Day', 'Ali', 'Sara', 'Total Sales'],
        [44927, 'Sat', 100, 200, 300],
        [44928, 'Sun', 150, 250, 400],
      ];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.headerRowIndex).toBe(0);
        expect(result.employeeStartCol).toBe(2);
        expect(result.employeeEndCol).toBe(4);
        expect(result.rows.length).toBe(2);
      }
    });

    it('detects header row when it is on row 2 (report-style)', () => {
      const rows = [
        ['Report Title'],
        [],
        ['Date', 'Day', 'Col1', 'Col2', 'Quantity'],
        [44927, 'Sat', 10, 20, 2],
      ];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.headerRowIndex).toBe(2);
        expect(result.rows.length).toBe(1);
      }
    });

    it('detects header row when it is on row 10', () => {
      const rows: unknown[][] = [
        ...Array(10).fill(['']),
        ['Date', 'Day', 'A', 'B', 'Pieces'],
        [44927, 'Sat', 100, 200, 5],
      ];
      for (let i = 0; i < 10; i++) rows[i] = [''];
      rows[10] = ['Date', 'Day', 'A', 'B', 'Pieces'];
      rows[11] = [44927, 'Sat', 100, 200, 5];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.headerRowIndex).toBe(10);
        expect(result.rows.length).toBe(1);
      }
    });

    it('returns blocking error when no header row found (no row with both date+day tokens)', () => {
      const rows = [
        ['Something', 'Else'],
        ['No', 'Date'],
        ['No', 'Day'],
      ];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Cannot find header row/);
      }
    });

    it('uses Employees_Map to match employee headers when present', () => {
      const mapRows = [
        ['empId', 'Name_in_Data'],
        ['E1', 'Ali'],
        ['E2', 'Sara'],
      ];
      const febRows = [
        ['Title'],
        [],
        ['Date', 'Day', 'Ali', 'Sara', 'Total Sales'],
        [44927, 'Sat', 100, 200, 300],
      ];
      const wb = workbookFromRows('FEB', febRows);
      wb.SheetNames.push('Employees_Map');
      wb.Sheets['Employees_Map'] = XLSX.utils.aoa_to_sheet(mapRows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.headerRowIndex).toBe(2);
        expect(result.matchedEmployeeHeaders).toContain('Ali');
        expect(result.matchedEmployeeHeaders).toContain('Sara');
      }
    });
  });

  describe('employee column range (exclude SALES, 0, analytics)', () => {
    it('excludes standalone SALES and numeric header 0 from employee columns', () => {
      const rows = [
        ['Date', 'Day', 'Abdulhadi', 'Muslim', 'SALES', '0', 'Total Sales'],
        [44927, 'Sat', 100, 200, 999, 999, 300],
      ];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.employeeColumns.map((c) => c.header)).toEqual(['Abdulhadi', 'Muslim']);
        expect(result.employeeEndCol).toBe(4);
        expect(result.rawEmployeeHeaders).toEqual(['Abdulhadi', 'Muslim']);
        expect(result.rows[0].values.map((v) => v.columnHeader)).toEqual(['Abdulhadi', 'Muslim']);
        expect(result.rows[0].values[0].amountSar).toBe(100);
        expect(result.rows[0].values[1].amountSar).toBe(200);
      }
    });

    it('stops employee range before Quantity (stop word)', () => {
      const rows = [
        ['Date', 'Day', 'Ali', 'Sara', 'Quantity'],
        [44927, 'Sat', 10, 20, 2],
      ];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.employeeColumns.map((c) => c.header)).toEqual(['Ali', 'Sara']);
        expect(result.employeeEndCol).toBe(4);
      }
    });
  });

  describe('data stop conditions', () => {
    it('stops when date cell contains "total"', () => {
      const rows = [
        ['Date', 'Day', 'X', 'Y'],
        [44927, 'Sat', 10, 20],
        ['Total', '', 30, 50],
        [44929, 'Mon', 5, 5],
      ];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.rows.length).toBe(1);
    });
  });

  describe('amount parsing', () => {
    it('skips blank and dash; rejects decimals as blocking error', () => {
      const rows = [
        ['Date', 'Day', 'A', 'B'],
        [44927, 'Sat', 100, 50.5],
      ];
      const wb = workbookFromRows('FEB', rows);
      const result = parseOneMonthlySheet(wb, 'FEB', '2026-02');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.reason.toLowerCase().includes('decimal'))).toBe(true);
      }
    });
  });
});
