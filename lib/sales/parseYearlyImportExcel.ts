/**
 * Parse yearly import Excel: sheet "Import_2026", Date column, emp_XXXX columns.
 * Returns rows with Riyadh-normalized date and per-employee numeric values.
 * Empty and "-" are skipped (no DB change); only numeric cells produce entries.
 * Supports .xlsx and .xlsm; reads cell values only (no macro execution, no formula evaluation).
 */

import * as XLSX from 'xlsx';
import { formatDateRiyadh, toRiyadhDateOnly } from '@/lib/time';

const SHEET_NAME = 'Import_2026';

export type EmployeeColumn = { index: number; header: string; empId: string };

export type YearlyImportRow = {
  date: Date;
  dateKey: string;
  values: { empId: string; amountSar: number }[];
  skippedEmptyCount: number;
  skippedDashCount: number;
};

export type ParseAmountError = {
  row: number;
  colHeader: string;
  rawType: string;
  rawValue: unknown;
  reason: string;
};

export type ParseYearlyImportResult = {
  ok: true;
  dateColumnIndex: number;
  employeeColumns: EmployeeColumn[];
  rows: YearlyImportRow[];
  skippedEmpty: number;
  skippedDash: number;
  errors: ParseAmountError[];
} | {
  ok: false;
  error: string;
};

const MAX_PARSE_ERRORS = 50;

/**
 * Extract primitive value from Excel cell (formula objects, rich text, etc.).
 * Does not execute macros or formulas; uses cached result/text.
 */
export function unwrapExcelCellValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) {
      const parts = (o.richText as Array<{ text?: string }>).map((x) => x?.text ?? '').filter(Boolean);
      return parts.join('');
    }
  }
  return v;
}

function getRawType(v: unknown): string {
  if (v == null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object' && v.constructor?.name) return `object(${v.constructor.name})`;
  return typeof v;
}

/**
 * Parse raw cell to integer SAR: unwraps Excel cell first, then skip empty/dash, accept decimals/strings, round.
 * Return: { ok: true, value } | { ok: false, reason } | { ok: true, skip: true }.
 * Do NOT require integer on raw input; only final intSar is integer.
 */
export function parseAmountSarInt(
  raw: unknown
): { ok: true; value: number } | { ok: false; reason: string } | { ok: true; skip: true } {
  const v = unwrapExcelCellValue(raw);
  if (v === null || v === undefined) return { ok: true, skip: true };
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s === '-') return { ok: true, skip: true };
    const cleaned = s.replace(/,/g, '').replace(/\s+/g, ' ').replace(/SAR/gi, '').trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { ok: false, reason: 'Not a number' };
    const intSar = Math.round(n);
    if (Number.isNaN(intSar)) return { ok: false, reason: 'Not a number' };
    if (intSar < 0) return { ok: false, reason: 'Negative amount' };
    return { ok: true, value: intSar };
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { ok: false, reason: 'Invalid number' };
    const intSar = Math.round(v);
    if (intSar < 0) return { ok: false, reason: 'Negative amount' };
    return { ok: true, value: intSar };
  }
  if (v instanceof Date || (typeof v === 'object' && v !== null && 'getTime' in (v as Date))) {
    return { ok: false, reason: 'Date is not an amount' };
  }
  return { ok: false, reason: 'Not a number' };
}

function excelDateToRiyadh(value: unknown): Date | null {
  if (value instanceof Date) {
    return toRiyadhDateOnly(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date: days since 1900-01-01 (with Excel bug 1900 leap)
    const d = new Date((value - 25569) * 86400 * 1000);
    return toRiyadhDateOnly(d);
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (match) {
      const [, y, m, d] = match.map(Number);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return toRiyadhDateOnly(parsed);
  }
  return null;
}


export function parseYearlyImportExcel(buffer: Buffer): ParseYearlyImportResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return { ok: false, error: 'Invalid Excel file' };
  }

  const sheetName = workbook.SheetNames.find((n) => n.trim() === SHEET_NAME);
  if (!sheetName) {
    return { ok: false, error: `Sheet "${SHEET_NAME}" not found` };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { ok: false, error: `Sheet "${SHEET_NAME}" not found` };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (rows.length < 2) {
    return { ok: true, dateColumnIndex: -1, employeeColumns: [], rows: [], skippedEmpty: 0, skippedDash: 0, errors: [] };
  }

  const headerRow = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
  const dateColIdx = headerRow.findIndex((h) => h.toLowerCase() === 'date');
  if (dateColIdx < 0) {
    return { ok: false, error: 'Column "Date" not found' };
  }

  const employeeColumns: EmployeeColumn[] = [];
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i];
    if (typeof h !== 'string') continue;
    const lower = h.toLowerCase();
    if (!lower.startsWith('emp_')) continue;
    const empId = h.slice(4).trim();
    if (empId) employeeColumns.push({ index: i, header: h, empId });
  }

  let skippedEmpty = 0;
  let skippedDash = 0;
  const errors: ParseAmountError[] = [];
  const rowResults: YearlyImportRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const dateVal = row[dateColIdx];
    const date = excelDateToRiyadh(dateVal);
    if (!date) continue;

    const dateKey = formatDateRiyadh(date);
    const values: { empId: string; amountSar: number }[] = [];
    let rowEmpty = 0;
    let rowDash = 0;

    for (const col of employeeColumns) {
      const cellRaw = row[col.index];
      const unwrapped = unwrapExcelCellValue(cellRaw);
      const parsed = parseAmountSarInt(cellRaw);
      if (parsed.ok && 'skip' in parsed && parsed.skip) {
        const isDash = typeof unwrapped === 'string' && unwrapped.trim() === '-';
        if (isDash) {
          skippedDash += 1;
          rowDash += 1;
        } else {
          skippedEmpty += 1;
          rowEmpty += 1;
        }
      } else if (!parsed.ok) {
        if (errors.length < MAX_PARSE_ERRORS) {
          errors.push({
            row: r + 1,
            colHeader: col.header,
            rawType: getRawType(unwrapped),
            rawValue: unwrapped,
            reason: parsed.reason,
          });
        }
      } else if (parsed.ok && 'value' in parsed) {
        values.push({ empId: col.empId, amountSar: parsed.value });
      }
    }

    if (values.length > 0) {
      rowResults.push({ date, dateKey, values, skippedEmptyCount: rowEmpty, skippedDashCount: rowDash });
    }
  }

  return {
    ok: true,
    dateColumnIndex: dateColIdx,
    employeeColumns,
    rows: rowResults,
    skippedEmpty,
    skippedDash,
    errors,
  };
}
