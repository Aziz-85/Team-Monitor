/**
 * Matrix Excel import helpers — server-only. No Prisma schema changes.
 * Used by POST /api/sales/import/matrix.
 */

import * as XLSX from 'xlsx';
import { toRiyadhDateString } from '@/lib/time';

const SHEET_NAME = 'DATA_MATRIX';
const HEADER_ROW_INDEX = 0;
const SCOPE_COL = 0;
const DATE_COL = 1;
const EMPLOYEE_START_COL = 3;

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/** Extract empId from header "1205 - Abdulaziz" using /^(\d+)\s*-/ */
export function parseEmpIdFromHeader(header: string): string | null {
  const s = String(header ?? '').trim();
  const match = /^(\d+)\s*-/.exec(s);
  return match ? match[1] : null;
}

/** Format date to YYYY-MM-DD in Asia/Riyadh. */
export function normalizeDateToDateKey(date: Date): string {
  return toRiyadhDateString(date);
}

/**
 * Parse cell value to integer SAR. Returns { value } where value=null means invalid
 * (decimal, negative, non-numeric). Empty / '-' / '—' are handled by caller as ignored.
 */
export function safeParseIntCell(value: unknown): { value: number | null } {
  const s = String(value ?? '').trim();
  if (s === '') return { value: null };
  const cleaned = s.replace(/,/g, '');
  if (/\./.test(cleaned)) return { value: null };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return { value: null };
  return { value: Math.round(n) };
}

export type MatrixParseIssue = {
  code: string;
  message: string;
  rowIndex?: number;
  colHeader?: string;
  dateKey?: string;
};

export type ParsedCell = {
  dateKey: string;
  empId: string;
  amount: number;
  rowIndex: number;
  colHeader: string;
  scopeId: string;
};

export type MatrixParseResult = {
  ok: true;
  scopeIds: string[];
  monthRange: { minMonth: string; maxMonth: string };
  rowsRead: number;
  cellsParsed: number;
  ignoredEmptyCells: number;
  cells: ParsedCell[];
  issues: MatrixParseIssue[];
} | {
  ok: false;
  error: string;
  issues?: MatrixParseIssue[];
};

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  const utcMs = (serial - 25569) * 86400 * 1000;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rawToDateKey(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return toRiyadhDateString(d);
    return null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = excelSerialToDate(raw);
    return d ? toRiyadhDateString(d) : null;
  }
  if (raw instanceof Date && !Number.isNaN((raw as Date).getTime())) {
    return toRiyadhDateString(raw as Date);
  }
  return null;
}

function isStopHeader(h: string): boolean {
  const s = h.trim().toLowerCase();
  if (!s) return true;
  if (s === 'total' || s.startsWith('total')) return true;
  if (s === 'notes' || s.startsWith('notes')) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

/** Parse workbook buffer; returns parsed cells and issues. Does not resolve empId -> userId. */
export function parseMatrixWorkbook(buffer: Buffer): MatrixParseResult {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `File too large (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)` };
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return { ok: false, error: 'Invalid Excel file' };
  }

  const sheetName = wb.SheetNames.find((n) => n.trim() === SHEET_NAME);
  if (!sheetName) {
    return { ok: false, error: `Sheet "${SHEET_NAME}" not found` };
  }

  const ws = wb.Sheets[sheetName];
  if (!ws) return { ok: false, error: `Sheet "${SHEET_NAME}" not found` };

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (aoa.length <= HEADER_ROW_INDEX) {
    return { ok: false, error: 'No header row in DATA_MATRIX' };
  }

  const headerRow = (aoa[HEADER_ROW_INDEX] ?? []).map((c) => String(c ?? '').trim());
  if (headerRow.length < 3) {
    return { ok: false, error: 'Header must include ScopeId, Date, and at least one column' };
  }

  const employeeCols: { colIndex: number; header: string; empId: string | null }[] = [];
  for (let c = EMPLOYEE_START_COL; c < headerRow.length; c++) {
    const h = headerRow[c];
    if (isStopHeader(h)) break;
    const empId = parseEmpIdFromHeader(h);
    employeeCols.push({ colIndex: c, header: h, empId });
  }

  const issues: MatrixParseIssue[] = [];
  const cells: ParsedCell[] = [];
  const scopeIdsSet = new Set<string>();
  const monthsSet = new Set<string>();
  let rowsRead = 0;
  let cellsParsed = 0;
  let ignoredEmptyCells = 0;

  for (let r = HEADER_ROW_INDEX + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const scopeIdRaw = row[SCOPE_COL];
    const scopeId = String(scopeIdRaw ?? '').trim();
    if (scopeId) scopeIdsSet.add(scopeId);

    const dateRaw = row[DATE_COL];
    const dateKey = rawToDateKey(dateRaw);
    if (!dateKey) {
      issues.push({
        code: 'INVALID_DATE',
        message: `Invalid date at row ${r + 1}`,
        rowIndex: r + 1,
        dateKey: undefined,
      });
      continue;
    }
    const month = dateKey.slice(0, 7);
    monthsSet.add(month);
    rowsRead += 1;

    for (const { colIndex, header, empId } of employeeCols) {
      if (empId === null) {
        issues.push({
          code: 'INVALID_HEADER',
          message: `Column "${header}" does not match EmpID format (e.g. "1205 - Name")`,
          rowIndex: r + 1,
          colHeader: header,
        });
        continue;
      }

      const raw = row[colIndex];
      const rawType = typeof raw;
      const rawStr = rawType === 'string' ? (raw as string).trim() : '';
      const isDash = rawStr === '-' || rawStr === '—';
      const isEmptyLike =
        raw == null ||
        (rawType === 'string' && rawStr === '') ||
        isDash;
      const provided =
        rawType === 'number' ||
        (rawType === 'string' && rawStr !== '' && !isDash);

      if (!provided || isEmptyLike) {
        ignoredEmptyCells += 1;
        continue;
      }

      const parsed = safeParseIntCell(raw);
      if (parsed.value === null) {
        issues.push({
          code: 'INVALID_AMOUNT',
          message: `Non-integer or negative value at row ${r + 1}`,
          rowIndex: r + 1,
          colHeader: header,
          dateKey,
        });
        continue;
      }

      if (parsed.value === 0) {
        const isExplicitZero =
          (rawType === 'number' && Number(raw) === 0) ||
          (rawType === 'string' && rawStr === '0');
        if (!isExplicitZero) {
          issues.push({
            code: 'INVALID_AMOUNT',
            message: `Zero value inferred from formula or formatting at row ${r + 1}; only explicit 0 is allowed`,
            rowIndex: r + 1,
            colHeader: header,
            dateKey,
          });
          continue;
        }
      }

      cells.push({
        dateKey,
        empId,
        amount: parsed.value,
        rowIndex: r + 1,
        colHeader: header,
        scopeId,
      });
      cellsParsed += 1;
    }
  }

  const monthArr = Array.from(monthsSet).sort();
  const minMonth = monthArr[0] ?? '';
  const maxMonth = monthArr[monthArr.length - 1] ?? '';

  return {
    ok: true,
    scopeIds: Array.from(scopeIdsSet),
    monthRange: { minMonth, maxMonth },
    rowsRead,
    cellsParsed,
    ignoredEmptyCells,
    cells,
    issues,
  };
}
