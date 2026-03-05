/**
 * Matrix Excel import helpers — server-only. No Prisma schema changes.
 * Used by POST /api/sales/import/matrix.
 */

import * as XLSX from 'xlsx';
import { toRiyadhDateString } from '@/lib/time';
import { dateKeyUTC, parseExcelDateToYMD, ymdToUTCNoon } from '@/lib/dates/safeCalendar';
import { parseExcelDateToDateKey } from '@/lib/sales/excelDateKey';

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
 * Parse cell value to integer SAR. Rounds decimals to nearest integer; use roundedFrom to audit.
 * Returns { value } where value=null means invalid (non-numeric or negative). Empty / '-' are handled by caller.
 */
export function safeParseIntCell(value: unknown): { value: number | null; roundedFrom?: number } {
  const s = String(value ?? '').trim();
  if (s === '') return { value: null };
  const cleaned = s.replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return { value: null };
  const rounded = Math.round(n);
  const hadDecimals = n !== rounded;
  return { value: rounded, ...(hadDecimals ? { roundedFrom: n } : {}) };
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
  roundedFrom?: number;
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

/**
 * Excel stores dates in creator's local time (Riyadh). Use Riyadh dateKey so 01/01 row = 2026-01-01.
 * parseExcelDateToDateKey uses toRiyadhDateString for Date/number — fixes 2025-12-31 21:00 UTC → 2026-01-01.
 */
function rawToDateKey(raw: unknown): string | null {
  return parseExcelDateToDateKey(raw);
}

function debugDateCell(rowIndex: number, raw: unknown, dateKey: string): void {
  // Only log a small number of rows to avoid noisy logs
  if (rowIndex > HEADER_ROW_INDEX + 6) return;
  try {
    const t = raw === null ? 'null' : typeof raw;
    let iso = '';
    let localYMD = '';
    let utcYMD = '';
    let safeUTCKey = '';

    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      iso = raw.toISOString();
      localYMD = `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(
        raw.getDate()
      ).padStart(2, '0')}`;
      utcYMD = `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}-${String(
        raw.getUTCDate()
      ).padStart(2, '0')}`;
    }

    try {
      const ymd = parseExcelDateToYMD(raw as unknown);
      const d = ymdToUTCNoon(ymd);
      safeUTCKey = dateKeyUTC(d);
    } catch {
      // ignore; safeUTCKey stays empty
    }

    // Truncate raw string representation to keep log readable
    const rawStr =
      typeof raw === 'string'
        ? raw.slice(0, 40)
        : raw instanceof Date
          ? `[Date ${iso}]`
          : JSON.stringify(raw)?.slice(0, 60);

    // eslint-disable-next-line no-console
    console.log(
      '[IMPORT_MATRIX_DEBUG]',
      'rowIndex',
      rowIndex + 1,
      'raw',
      rawStr,
      'type',
      t,
      'iso',
      iso,
      'localYMD',
      localYMD,
      'utcYMD',
      utcYMD,
      'safeUTCKey',
      safeUTCKey,
      'dateKey',
      dateKey
    );
  } catch {
    // best-effort debug only
  }
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
  let lastNonEmptyScopeIdSeen: string | null = null;

  // Log header diagnostics once
  try {
    // eslint-disable-next-line no-console
    console.log(
      '[IMPORT_MATRIX_DEBUG]',
      'headerRowIndex',
      HEADER_ROW_INDEX + 1,
      'headerLength',
      headerRow.length,
      'headerSample',
      headerRow.slice(0, 8)
    );
  } catch {
    // ignore
  }

  for (let r = HEADER_ROW_INDEX + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const scopeCell = row[SCOPE_COL];
    const scopeIdCandidate =
      typeof scopeCell === 'string' ? scopeCell.trim() : String(scopeCell ?? '').trim();
    const normalized = scopeIdCandidate.toUpperCase();
    if (normalized) lastNonEmptyScopeIdSeen = normalized;
    const effectiveScopeId = normalized || lastNonEmptyScopeIdSeen || '';
    if (effectiveScopeId) scopeIdsSet.add(effectiveScopeId);

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

    if (process.env.NODE_ENV !== 'production' && rowsRead < 12) {
      const scopeIdEmpty = !normalized;
      // eslint-disable-next-line no-console
      console.log('[IMPORT_MATRIX_DEBUG]', 'scopeRow', {
        rowIndex: r + 1,
        scopeIdRaw: scopeCell == null ? null : String(scopeCell).slice(0, 20),
        normalizedScopeId: normalized || '(empty)',
        dateKey,
        scopeIdEmpty,
        effectiveScopeId: effectiveScopeId || '(none)',
      });
    }

    debugDateCell(r, dateRaw, dateKey);
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
        scopeId: effectiveScopeId,
        ...(parsed.roundedFrom != null && { roundedFrom: parsed.roundedFrom }),
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
