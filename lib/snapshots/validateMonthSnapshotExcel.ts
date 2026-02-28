/**
 * Server-only. Validate month snapshot Excel structure before saving.
 * Expects sheets: "Daily" (Date, NetSales, Invoices, Pieces), "Staff" (EmpId, EmployeeName, Role?, Target, Sales, Invoices, Pieces).
 * NetSales/Sales/Target are SAR whole numbers; dates must be in selected month.
 */

import * as XLSX from 'xlsx';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export type ValidationError = {
  code: string;
  message: string;
  sheet?: string;
  row?: number;
  column?: string;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

function findColIndex(header: string[], ...candidates: string[]): number {
  const lower = header.map((h) => String(h ?? '').trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h === c.toLowerCase() || h.includes(c.toLowerCase()) || c.toLowerCase().includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

function parseDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(v.trim());
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${day}`;
    }
    return null;
  }
  if (typeof v === 'number' && !Number.isNaN(v)) {
    const d = new Date((v - 25569) * 86400 * 1000);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return null;
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => c == null || String(c).trim() === '');
}

export function validateMonthSnapshotExcel(
  buffer: Buffer,
  monthKey: string
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!MONTH_REGEX.test(monthKey)) {
    errors.push({ code: 'INVALID_MONTH', message: 'monthKey must be YYYY-MM' });
    return { valid: false, errors };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    errors.push({ code: 'PARSE_ERROR', message: 'Failed to parse Excel file' });
    return { valid: false, errors };
  }

  const sheetNames = workbook.SheetNames ?? [];
  const hasDaily = sheetNames.some((s) => s.trim().toLowerCase() === 'daily');
  const hasStaff = sheetNames.some((s) => s.trim().toLowerCase() === 'staff');

  if (!hasDaily) {
    errors.push({ code: 'MISSING_SHEET', message: 'Sheet "Daily" is required', sheet: 'Daily' });
  }
  if (!hasStaff) {
    errors.push({ code: 'MISSING_SHEET', message: 'Sheet "Staff" is required', sheet: 'Staff' });
  }
  if (!hasDaily && !hasStaff) {
    return { valid: false, errors };
  }

  const [year, monthNum] = monthKey.split('-').map(Number);
  const monthStart = new Date(year, monthNum - 1, 1);
  const monthEnd = new Date(year, monthNum, 0);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

  if (hasDaily) {
    const dailySheetName = sheetNames.find((s) => s.trim().toLowerCase() === 'daily')!;
    const sheet = workbook.Sheets[dailySheetName];
    if (!sheet) {
      errors.push({ code: 'SHEET_EMPTY', message: 'Sheet "Daily" is empty', sheet: 'Daily' });
    } else {
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 2) {
        errors.push({ code: 'NO_DAILY_ROWS', message: 'Sheet "Daily" must have at least a header and one data row', sheet: 'Daily' });
      } else {
        const header = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
        const dateCol = findColIndex(header, 'date');
        const netSalesCol = findColIndex(header, 'netsales', 'net_sales', 'net sales');
        const invCol = findColIndex(header, 'invoices', 'invoice');
        const piecesCol = findColIndex(header, 'pieces', 'pcs');

        if (dateCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "Date" is required', sheet: 'Daily', column: 'Date' });
        if (netSalesCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "NetSales" is required', sheet: 'Daily', column: 'NetSales' });
        if (invCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "Invoices" is required', sheet: 'Daily', column: 'Invoices' });
        if (piecesCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "Pieces" is required', sheet: 'Daily', column: 'Pieces' });

        let validDailyCount = 0;
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          if (isBlankRow(row)) continue;
          const dateStr = dateCol >= 0 ? parseDate(row[dateCol]) : null;
          if (!dateStr) {
            errors.push({ code: 'INVALID_DATE', message: 'Date must be YYYY-MM-DD', sheet: 'Daily', row: i + 1, column: 'Date' });
            continue;
          }
          if (dateStr < monthStartStr || dateStr > monthEndStr) {
            errors.push({ code: 'DATE_OUT_OF_MONTH', message: `Date ${dateStr} is not in ${monthKey}`, sheet: 'Daily', row: i + 1 });
            continue;
          }
          const netSales = netSalesCol >= 0 ? Number(row[netSalesCol]) : NaN;
          if (Number.isNaN(netSales) || netSales < 0) {
            errors.push({ code: 'INVALID_NETSALES', message: 'NetSales must be a non-negative number (SAR)', sheet: 'Daily', row: i + 1 });
            continue;
          }
          const inv = invCol >= 0 ? Number(row[invCol]) : 0;
          const pcs = piecesCol >= 0 ? Number(row[piecesCol]) : 0;
          if (!Number.isInteger(inv) || inv < 0 || !Number.isInteger(pcs) || pcs < 0) {
            errors.push({ code: 'INVALID_INTEGER', message: 'Invoices and Pieces must be non-negative integers', sheet: 'Daily', row: i + 1 });
            continue;
          }
          validDailyCount++;
        }
        if (validDailyCount === 0) {
          errors.push({ code: 'NO_VALID_DAILY_ROWS', message: 'At least one valid Daily row is required', sheet: 'Daily' });
        }
      }
    }
  }

  if (hasStaff) {
    const staffSheetName = sheetNames.find((s) => s.trim().toLowerCase() === 'staff')!;
    const sheet = workbook.Sheets[staffSheetName];
    if (!sheet) {
      errors.push({ code: 'SHEET_EMPTY', message: 'Sheet "Staff" is empty', sheet: 'Staff' });
    } else {
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 1) {
        errors.push({ code: 'NO_STAFF_HEADER', message: 'Sheet "Staff" must have a header row', sheet: 'Staff' });
      } else {
        const header = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
        const empIdCol = findColIndex(header, 'empid', 'emp id', 'employee id');
        const nameCol = findColIndex(header, 'employeename', 'employee name', 'name', 'employee');
        const targetCol = findColIndex(header, 'target');
        const salesCol = findColIndex(header, 'sales');
        const invCol = findColIndex(header, 'invoices');
        const piecesCol = findColIndex(header, 'pieces');
        if (empIdCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "EmpId" is required', sheet: 'Staff', column: 'EmpId' });
        if (nameCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "EmployeeName" is required', sheet: 'Staff', column: 'EmployeeName' });
        if (targetCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "Target" is required', sheet: 'Staff', column: 'Target' });
        if (salesCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "Sales" is required', sheet: 'Staff', column: 'Sales' });
        if (invCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "Invoices" is required', sheet: 'Staff', column: 'Invoices' });
        if (piecesCol < 0) errors.push({ code: 'MISSING_COLUMN', message: 'Column "Pieces" is required', sheet: 'Staff', column: 'Pieces' });
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true };
}
