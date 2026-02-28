/**
 * Matrix Template Import — sheet "DATA_MATRIX" only.
 * Columns: ScopeId (A), Date (B), Day (C), then employee columns until TOTAL/Notes.
 * Header row = row 1 (index 0). Employee columns start at index 3.
 */

import * as XLSX from 'xlsx';

const SHEET_NAME = 'DATA_MATRIX';
const HEADER_ROW_INDEX = 0;
const SCOPE_COL = 0;
const DATE_COL = 1;
const EMPLOYEE_START_COL = 3;

const EMPLOYEE_START_COL_1BASED = 4; // Column D (0-based index = 3)

function normalize(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.\-_]/g, '');
}

function normalizeForMatch(s: string): string {
  let t = normalize(s);
  t = t.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  t = t.replace(/[\u064B-\u065F\u0670]/g, '');
  return t;
}

/** Get displayed cell value: formula result, richText, or raw value. */
function getCellValue(cell: unknown): string | number {
  if (!cell) return '';

  const v = (cell as { value?: unknown }).value;

  if (v == null) return '';

  if (typeof v === 'object' && (v as { formula?: unknown }).formula != null) {
    const res = (v as { result?: unknown }).result;
    return res != null ? (typeof res === 'number' ? res : String(res)) : '';
  }

  if (typeof v === 'object' && Array.isArray((v as { richText?: unknown[] }).richText)) {
    return (v as { richText: Array<{ text?: string }> }).richText.map((t) => t?.text ?? '').join('');
  }

  return v as string | number;
}

function unwrapCell(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('v' in o) return o.v;
    if ('text' in o) return o.text;
    if (Array.isArray((o as { richText?: unknown }).richText)) {
      return ((o as { richText: Array<{ text?: string }> }).richText)
        .map((x) => x?.text ?? '')
        .join('');
    }
  }
  return raw;
}

function parseCellValue(raw: unknown): { kind: 'skip' } | { kind: 'ok'; value: number } | { kind: 'error'; reason: string } {
  const v = unwrapCell(raw);
  if (v === null || v === undefined) return { kind: 'skip' };
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s === '-' || s === '—') return { kind: 'skip' };
    const cleaned = s.replace(/,/g, '').trim();
    if (/\./.test(cleaned)) return { kind: 'error', reason: 'Decimals not allowed' };
    const n = Number(cleaned);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return { kind: 'error', reason: 'Not a valid integer SAR' };
    return { kind: 'ok', value: n };
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { kind: 'error', reason: 'Invalid number' };
    if (Math.round(v) !== v) return { kind: 'error', reason: 'Decimals not allowed' };
    if (v < 0) return { kind: 'error', reason: 'Negative amount' };
    return { kind: 'ok', value: Math.round(v) };
  }
  return { kind: 'error', reason: 'Invalid value type' };
}

/** Header is empty or numeric only → stop column (not an employee). */
function isEmptyOrNumericHeader(headerRaw: string): boolean {
  const h = String(headerRaw ?? '').trim();
  if (!h) return true;
  if (/^\d+$/.test(normalize(h))) return true;
  return false;
}

export type MatrixParseRow = {
  scopeId: string;
  dateKey: string;
  date: Date;
  values: { colIndex: number; headerRaw: string; amountSar: number }[];
  skippedEmpty: number;
};

export type MatrixParseResult = {
  ok: true;
  sheetName: string;
  headerRowIndex: number;
  employeeStartCol: number;
  employeeEndCol: number;
  employeeColumns: { colIndex: number; headerRaw: string }[];
  rows: MatrixParseRow[];
  blockingErrors: { type: string; message: string; row: number; col: number; headerRaw: string; value: unknown }[];
  sampleNonBlankCells: { row: number; col: number; headerRaw: string; value: unknown }[];
  diagnostic: { totalRows: number; totalCols: number; employeeStartCol: number; employeeEndCol: number };
} | {
  ok: false;
  error: string;
};

const SAMPLE_MAX = 12;

export function parseMatrixTemplateExcel(buffer: Buffer): MatrixParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return { ok: false, error: 'Invalid Excel file' };
  }

  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toUpperCase() === SHEET_NAME.toUpperCase()
  );
  if (!sheetName) {
    return { ok: false, error: `Sheet "${SHEET_NAME}" not found. Use the Matrix template with sheet name DATA_MATRIX.` };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { ok: false, error: `Sheet "${SHEET_NAME}" not found` };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (rows.length <= HEADER_ROW_INDEX) {
    return { ok: false, error: `Sheet "${SHEET_NAME}" has no header row` };
  }

  const headerRow = (rows[HEADER_ROW_INDEX] as unknown[]).map((c) => String(c ?? '').trim());

  // employeeStartCol = 4 (1-based). employeeEndCol = last employee column index (0-based).
  const totalColIndex = headerRow.findIndex((h, c) => c >= EMPLOYEE_START_COL && normalize(h ?? '') === 'total');
  let lastEmployeeColIndex: number;
  if (totalColIndex >= EMPLOYEE_START_COL) {
    lastEmployeeColIndex = totalColIndex - 1;
  } else {
    const firstEmptyOrNumeric = headerRow.findIndex((h, c) => c >= EMPLOYEE_START_COL && isEmptyOrNumericHeader(h ?? ''));
    if (firstEmptyOrNumeric >= EMPLOYEE_START_COL) {
      lastEmployeeColIndex = firstEmptyOrNumeric - 1;
    } else {
      lastEmployeeColIndex = headerRow.length - 1;
    }
  }

  const resultRows: MatrixParseRow[] = [];
  const blockingErrors: { type: string; message: string; row: number; col: number; headerRaw: string; value: unknown }[] = [];
  const sampleNonBlankCells: { row: number; col: number; headerRaw: string; value: unknown }[] = [];

  if (lastEmployeeColIndex < EMPLOYEE_START_COL) {
    blockingErrors.push({
      type: 'NO_EMPLOYEE_COLUMNS_DETECTED',
      message: 'No employee columns detected (TOTAL not found or no valid headers before it)',
      row: HEADER_ROW_INDEX + 1,
      col: EMPLOYEE_START_COL_1BASED,
      headerRaw: '',
      value: null,
    });
  }

  const employeeColumns: { colIndex: number; headerRaw: string }[] = [];
  for (let c = EMPLOYEE_START_COL; c <= lastEmployeeColIndex; c++) {
    const raw = String(headerRow[c] ?? '').trim();
    if (raw) employeeColumns.push({ colIndex: c, headerRaw: raw });
  }

  for (let r = HEADER_ROW_INDEX + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const dateRaw = row[DATE_COL];
    const dateStr = String(unwrapCell(dateRaw) ?? '').trim();
    if (!dateStr) continue;

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!dateMatch) {
      blockingErrors.push({
        type: 'INVALID_DATE',
        message: `Invalid date format (expected YYYY-MM-DD): ${dateStr}`,
        row: r + 1,
        col: DATE_COL + 1,
        headerRaw: 'Date',
        value: dateRaw,
      });
      continue;
    }
    const dateKey = dateStr;
    const date = new Date(dateKey + 'T00:00:00.000Z');
    const scopeId = String(unwrapCell(row[SCOPE_COL]) ?? '').trim();

    const values: { colIndex: number; headerRaw: string; amountSar: number }[] = [];
    let skippedEmpty = 0;

    for (const { colIndex, headerRaw } of employeeColumns) {
      const cell = row[colIndex];
      const rawValue = getCellValue(cell);
      const text = String(rawValue ?? '').trim();

      if (!text || text === '-' || text === '—') {
        skippedEmpty += 1;
        continue;
      }

      const parsed = parseCellValue(rawValue);
      if (parsed.kind === 'skip') {
        skippedEmpty += 1;
        continue;
      }
      if (parsed.kind === 'error') {
        blockingErrors.push({
          type: 'INVALID_VALUE',
          message: parsed.reason,
          row: r + 1,
          col: colIndex + 1,
          headerRaw,
          value: rawValue,
        });
        continue;
      }
      values.push({ colIndex, headerRaw, amountSar: parsed.value });
      if (sampleNonBlankCells.length < SAMPLE_MAX) {
        sampleNonBlankCells.push({ row: r + 1, col: colIndex + 1, headerRaw, value: rawValue });
      }
    }

    resultRows.push({ scopeId, dateKey, date, values, skippedEmpty });
  }

  const totalRows = rows.length;
  const totalCols = headerRow.length;
  const employeeEndCol1Based = lastEmployeeColIndex + 1;

  return {
    ok: true,
    sheetName: SHEET_NAME,
    headerRowIndex: HEADER_ROW_INDEX + 1,
    employeeStartCol: EMPLOYEE_START_COL_1BASED,
    employeeEndCol: employeeEndCol1Based,
    employeeColumns: employeeColumns.map((e) => ({ colIndex: e.colIndex, headerRaw: e.headerRaw })),
    rows: resultRows,
    blockingErrors,
    sampleNonBlankCells,
    diagnostic: {
      totalRows,
      totalCols,
      employeeStartCol: EMPLOYEE_START_COL_1BASED,
      employeeEndCol: employeeEndCol1Based,
    },
  };
}

/** Extract empId from header "EMPID - Name" or return null for name-only fallback. */
export function extractEmpIdFromHeader(headerRaw: string): string | null {
  const s = String(headerRaw ?? '').trim();
  const dashIdx = s.indexOf(' - ');
  if (dashIdx <= 0) return null;
  const left = s.slice(0, dashIdx).trim();
  if (!/^[Ee]\d+$/i.test(left) && !/^[a-zA-Z0-9_-]+$/.test(left)) return null;
  return left;
}

export { normalizeForMatch };
