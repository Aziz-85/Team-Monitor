/**
 * Monthly Sheet Import — parse Excel from month-named sheet (e.g. FEB).
 * Robust header discovery: scan up to HEADER_SCAN_ROWS for date + day + name-like headers.
 * Employees_Map sheet optional. Do NOT read "Data" sheet.
 */

import * as XLSX from 'xlsx';
import { formatDateRiyadh, toRiyadhDateOnly } from '@/lib/time';

export const HEADER_SCAN_ROWS = 120;

const MONTH_SHEET_NAMES: Record<number, string> = {
  1: 'JAN', 2: 'FEB', 3: 'MAR', 4: 'APR', 5: 'MAY', 6: 'JUN',
  7: 'JUL', 8: 'AUG', 9: 'SEP', 10: 'OCT', 11: 'NOV', 12: 'DEC',
};

const DATE_TOKENS = [
  'date', 'dt', 'transaction date', 'sales date',
  'التاريخ', 'تاريخ', 'يوم', 'بتاريخ',
].map((s) => s.toLowerCase());

const DAY_TOKENS = [
  'day', 'day name', 'weekday', 'dow',
  'اليوم', 'اسم اليوم',
].map((s) => s.toLowerCase());

const ANALYTICS_TOKENS = [
  'total', 'sales', 'qty', 'quantity', 'invoice', 'invoices', 'pieces',
  'avt', 'avp', 'upt', 'target', 'details', 'grand total',
  'الإجمالي', 'اجمالي', 'المجموع', 'القطع', 'الفواتير', 'الكمية', 'تارجت',
].map((s) => s.toLowerCase());

const STOP_WORDS = new Set([
  'total', 'sales', 'total sales', 'quantity', 'invoice', 'pieces',
  'avt', 'avp', 'upt', 'target', 'details', 'day target', 'daily target',
  ...ANALYTICS_TOKENS,
].map((w) => w.toLowerCase()));

/** Read cell value as text (xlsx raw value: formula result, richText, Date -> "DATE", merged handled by sheet_to_json). */
function cellText(raw: unknown): string {
  if (raw == null) return '';
  const v = unwrapCellValue(raw);
  if (v == null) return '';
  if (v instanceof Date) return 'DATE';
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (o.formula != null && 'result' in o) return String((o as { result?: unknown }).result ?? '').trim();
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((t) => t?.text ?? '').join('').trim();
    }
  }
  return String(v).trim();
}

function unwrapCellValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('text' in o) return o.text;
    if ('v' in o) return o.v;
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((x) => x?.text ?? '').join('');
    }
  }
  return v;
}

/** Normalize header/cell for matching: trim, collapse whitespace, lower, remove line breaks. */
export function normalizeCell(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim()
    .toLowerCase();
}

function isStopHeader(normalized: string): boolean {
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (STOP_WORDS.has(normalized)) return true;
  return Array.from(STOP_WORDS).some((t) => normalized.includes(t));
}

/** Name-like header: does NOT depend on DB; heuristic only (length > 2, not numeric, not analytics). */
function isLikelyNameHeader(sRaw: string): boolean {
  const s = String(sRaw ?? '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (/^\d+$/.test(lower)) return false;
  if (ANALYTICS_TOKENS.some((t) => lower.includes(t) || lower === t)) return false;
  if (s.length <= 2) return false;
  if (/^[A-Z]{2,5}$/.test(s)) return false;
  return true;
}

function isDateLike(v: unknown): boolean {
  if (v instanceof Date) return true;
  if (typeof v === 'number') return v > 35000 && v < 60000;
  if (typeof v === 'string') {
    const t = String(v).trim();
    return /^\d{4}-\d{1,2}-\d{1,2}$/.test(t) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t);
  }
  return false;
}

export type HeaderCandidate = {
  row: number;
  dateHit: boolean;
  dayHit: boolean;
  names: number;
  analytics: number;
  sample: string[];
};

/** Find best header row; returns row index (0-based) or null and list of candidates for diagnostic. */
function findHeaderRow(rows: unknown[][]): { headerRow: number | null; candidates: HeaderCandidate[] } {
  const candidates: HeaderCandidate[] = [];
  const maxRow = Math.min(rows.length, HEADER_SCAN_ROWS);
  const maxCol = 80;

  for (let r = 0; r < maxRow; r++) {
    const row = rows[r] as unknown[] | undefined;
    if (!row || row.length === 0) continue;

    let dateHit = false;
    let dayHit = false;
    let names = 0;
    let analytics = 0;
    const sample: string[] = [];

    for (let c = 0; c < Math.min(row.length, maxCol); c++) {
      const raw = row[c];
      const rawStr = cellText(raw);
      const lower = rawStr.toLowerCase();

      if (rawStr) sample.push(rawStr);

      if (DATE_TOKENS.some((t) => lower.includes(t)) || rawStr === 'DATE') dateHit = true;
      if (DAY_TOKENS.some((t) => lower.includes(t))) dayHit = true;

      if (ANALYTICS_TOKENS.some((t) => lower.includes(t) || lower === t)) analytics += 1;
      else if (isLikelyNameHeader(rawStr)) names += 1;
    }

    if (sample.length > 0) {
      candidates.push({
        row: r,
        dateHit,
        dayHit,
        names,
        analytics,
        sample: sample.slice(0, 12),
      });
    }

    if (dateHit && dayHit && names >= 2 && analytics < names) {
      return { headerRow: r, candidates: candidates.slice(-15) };
    }
  }

  const best = [...candidates].sort((a, b) => {
    const scoreA = (a.dateHit ? 5 : 0) + (a.dayHit ? 5 : 0) + a.names - a.analytics;
    const scoreB = (b.dateHit ? 5 : 0) + (b.dayHit ? 5 : 0) + b.names - b.analytics;
    return scoreB - scoreA;
  })[0];

  const accepted =
    best != null &&
    best.dateHit &&
    best.dayHit &&
    best.names >= 1 &&
    best.analytics < best.names;

  return {
    headerRow: accepted ? best!.row : null,
    candidates: best ? candidates.slice(0, 0).concat([best]) : candidates.slice(0, 20),
  };
}

/** Load expected employee header labels from workbook sheet "Employees_Map" (empId, Name_in_Data). */
export function loadEmployeesMap(workbook: XLSX.WorkBook): Set<string> {
  const set = new Set<string>();
  const map = loadEmployeesMapWithIds(workbook);
  map.forEach((_, key) => set.add(key));
  return set;
}

/** Load Employees_Map sheet as optional override: normalized header -> empId. */
export function loadEmployeesMapWithIds(workbook: XLSX.WorkBook): Map<string, string> {
  const out = new Map<string, string>();
  const name = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase().replace(/\s+/g, ' ') === 'employees_map'
  );
  if (!name) return out;
  const sheet = workbook.Sheets[name];
  if (!sheet) return out;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (rows.length < 2) return out;
  const headerRow = (rows[0] as unknown[]).map((c) => normalizeCell(String(c ?? '')));
  const empIdIdx = headerRow.findIndex((h) => h === 'empid' || h === 'emp id');
  const nameIdx = headerRow.findIndex((h) => h === 'name_in_data' || h === 'name in data');
  if (empIdIdx < 0 || nameIdx < 0) return out;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const empId = String(row[empIdIdx] ?? '').trim();
    const nameInData = String(row[nameIdx] ?? '').trim();
    if (empId && nameInData) {
      const key = normalizeCell(nameInData);
      out.set(key, empId);
    }
    if (empId) {
      const lower = empId.toLowerCase();
      const idKey = lower.startsWith('emp_') ? lower : `emp_${lower}`;
      out.set(idKey, empId);
    }
  }
  return out;
}

export function sheetNameFromMonth(monthKey: string): string {
  const [, m] = monthKey.split('-').map(Number);
  if (!Number.isFinite(m) || m < 1 || m > 12) return '';
  return MONTH_SHEET_NAMES[m] ?? '';
}

/** Previous month key (YYYY-MM). */
export function previousMonthKey(monthKey: string): string | null {
  const [y, m] = monthKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export type MonthlySheetRow = {
  date: Date;
  dateKey: string;
  values: { columnHeader: string; amountSar: number }[];
  skippedEmptyCount: number;
};

export type ParseMonthlySheetResult = {
  ok: true;
  sheetName: string;
  employeeColumns: { colIndex: number; header: string }[];
  rows: MonthlySheetRow[];
  errors: { row: number; colHeader: string; reason: string }[];
  headerRowIndex?: number;
  employeeStartCol?: number;
  employeeEndCol?: number;
  matchedEmployeeHeaders?: string[];
  rawEmployeeHeaders?: string[];
  nonBlankCellsCount?: number;
  sampleNonBlankCells?: { row: number; col: number; header: string; rawValue: unknown }[];
  blockingErrors?: { row: number; colHeader: string; reason: string }[];
  headerScanRows?: number;
  headerCandidates?: HeaderCandidate[];
} | {
  ok: false;
  error: string;
  headerScanRows?: number;
  headerCandidates?: HeaderCandidate[];
};

/** Parse date from cell with optional year from monthKey (e.g. "2026-02" for "14-Feb"). */
function excelDateToDateKeyWithYear(raw: unknown, yearFromMonth?: number): string | null {
  const key = excelDateToDateKey(raw);
  if (key) return key;
  if (raw == null || yearFromMonth == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const dayFirst = /^(\d{1,2})[-/](\w{3,})$/i.exec(s);
  const monthFirst = /^(\w{3,})[-/](\d{1,2})$/i.exec(s);
  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  let day = 0;
  let monStr = '';
  if (dayFirst) {
    day = parseInt(dayFirst[1], 10);
    monStr = dayFirst[2];
  } else if (monthFirst) {
    day = parseInt(monthFirst[2], 10);
    monStr = monthFirst[1];
  }
  if (day >= 1 && day <= 31 && monStr) {
    const m = monthNames[monStr.toLowerCase().slice(0, 3)];
    if (m) {
      const d = new Date(Date.UTC(yearFromMonth, m - 1, day, 0, 0, 0, 0));
      return formatDateRiyadh(toRiyadhDateOnly(d));
    }
  }
  return null;
}

/** Parse a single month-named sheet from an already-open workbook. Uses robust header discovery (scan first 25 rows). */
export function parseOneMonthlySheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  monthKey?: string
): ParseMonthlySheetResult {
  const found = workbook.SheetNames.find((n) => n.trim().toUpperCase() === sheetName.toUpperCase());
  if (!found) {
    return { ok: false, error: `Sheet "${sheetName}" not found` };
  }
  const sheet = workbook.Sheets[found];
  if (!sheet) return { ok: false, error: `Sheet "${sheetName}" not found` };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  const expectedEmployeeHeaders = loadEmployeesMap(workbook);

  const { headerRow, candidates: headerCandidates } = findHeaderRow(rows);

  if (headerRow == null) {
    return {
      ok: false,
      error: `Cannot find header row in sheet "${sheetName}". Scan first ${HEADER_SCAN_ROWS} rows. Check headerCandidates in diagnostic.`,
      headerScanRows: HEADER_SCAN_ROWS,
      headerCandidates: headerCandidates.length > 0 ? headerCandidates : undefined,
    };
  }

  const headerRowIndex = headerRow;
  const headerRowRaw = (rows[headerRowIndex] as unknown[]).map((c) => cellText(c));
  const headerRowNorm = headerRowRaw.map((c) => normalizeCell(c));

  let dateCol = headerRowNorm.findIndex((h) => (h && (DATE_TOKENS.some((t) => h.includes(t)) || h === 'date')) ?? false);
  if (dateCol < 0) {
    for (let col = 0; col < Math.min(headerRowRaw.length, 20); col++) {
      let dateLikeCount = 0;
      for (let r = headerRowIndex + 1; r <= Math.min(headerRowIndex + 5, rows.length - 1); r++) {
        const row = rows[r] as unknown[];
        if (isDateLike(row[col])) dateLikeCount += 1;
      }
      if (dateLikeCount >= 3) {
        dateCol = col;
        break;
      }
    }
  }
  if (dateCol < 0) dateCol = 0;

  let start = dateCol + 1;
  while (start < headerRowNorm.length && (DAY_TOKENS.some((t) => (headerRowNorm[start] ?? '').includes(t)) || !headerRowNorm[start])) {
    start += 1;
  }
  while (start < headerRowNorm.length && (isStopHeader(headerRowNorm[start] ?? '') || !headerRowNorm[start])) {
    start += 1;
  }
  const employeeStartCol = start;

  let employeeEndCol = headerRowRaw.length;
  for (let c = employeeStartCol; c < headerRowRaw.length; c++) {
    if (isStopHeader(headerRowNorm[c] ?? '')) {
      employeeEndCol = c;
      break;
    }
  }

  const employeeColumns: { colIndex: number; header: string }[] = [];
  const rawEmployeeHeaders: string[] = [];
  const matchedEmployeeHeaders: string[] = [];
  for (let c = employeeStartCol; c < employeeEndCol; c++) {
    const label = headerRowRaw[c] ?? '';
    rawEmployeeHeaders.push(label);
    if (label) {
      employeeColumns.push({ colIndex: c, header: label });
      if (expectedEmployeeHeaders.size > 0 && expectedEmployeeHeaders.has(headerRowNorm[c] ?? '')) {
        matchedEmployeeHeaders.push(label);
      }
    }
  }

  const yearFromMonth = monthKey ? parseInt(monthKey.slice(0, 4), 10) : undefined;
  const dataStartIndex = headerRowIndex + 1;
  const errors: { row: number; colHeader: string; reason: string }[] = [];
  const blockingErrors: { row: number; colHeader: string; reason: string }[] = [];
  const resultRows: MonthlySheetRow[] = [];
  let consecutiveEmptyDates = 0;
  const EMPTY_LIMIT = 5;
  let nonBlankCellsCount = 0;
  const sampleNonBlankCells: { row: number; col: number; header: string; rawValue: unknown }[] = [];
  const SAMPLE_MAX = 10;

  for (let r = dataStartIndex; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const dateRaw = row[dateCol];
    const dateStr = String(dateRaw ?? '').trim();
    if (normalizeCell(dateStr).includes('total')) break;
    const dateKey = excelDateToDateKeyWithYear(dateRaw, yearFromMonth) ?? excelDateToDateKey(dateRaw);
    if (!dateKey) {
      consecutiveEmptyDates += 1;
      if (consecutiveEmptyDates >= EMPTY_LIMIT) break;
      continue;
    }
    consecutiveEmptyDates = 0;

    const values: { columnHeader: string; amountSar: number }[] = [];
    let skippedEmpty = 0;

    for (const { colIndex, header } of employeeColumns) {
      const cell = row[colIndex];
      const rawVal = unwrapCell(cell);
      const parsed = parseCellAmount(cell);
      if (parsed.kind === 'skip') {
        skippedEmpty += 1;
        continue;
      }
      if (parsed.kind === 'error') {
        nonBlankCellsCount += 1;
        if (errors.length < MAX_ERRORS) {
          errors.push({ row: r + 1, colHeader: header, reason: parsed.reason });
        }
        if (parsed.reason.includes('Decimal') || parsed.reason.includes('Negative') || parsed.reason.includes('integer')) {
          blockingErrors.push({ row: r + 1, colHeader: header, reason: parsed.reason });
        }
        if (sampleNonBlankCells.length < SAMPLE_MAX) {
          sampleNonBlankCells.push({ row: r + 1, col: colIndex, header, rawValue: rawVal });
        }
        continue;
      }
      nonBlankCellsCount += 1;
      if (sampleNonBlankCells.length < SAMPLE_MAX) {
        sampleNonBlankCells.push({ row: r + 1, col: colIndex, header, rawValue: rawVal });
      }
      values.push({ columnHeader: header, amountSar: parsed.value });
    }

    const dateOnly = new Date(dateKey + 'T00:00:00.000Z');
    resultRows.push({
      date: dateOnly,
      dateKey,
      values,
      skippedEmptyCount: skippedEmpty,
    });
  }

  return {
    ok: true,
    sheetName,
    employeeColumns,
    rows: resultRows,
    errors,
    headerRowIndex,
    employeeStartCol,
    employeeEndCol,
    matchedEmployeeHeaders: matchedEmployeeHeaders.length > 0 ? matchedEmployeeHeaders : undefined,
    rawEmployeeHeaders,
    nonBlankCellsCount,
    sampleNonBlankCells: sampleNonBlankCells.length > 0 ? sampleNonBlankCells : undefined,
    blockingErrors: blockingErrors.length > 0 ? blockingErrors : undefined,
    headerScanRows: HEADER_SCAN_ROWS,
    headerCandidates: headerCandidates.length > 0 ? headerCandidates : undefined,
  };
}

function unwrapCell(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((x) => x?.text ?? '').join('');
    }
  }
  return v;
}

/** Value rules: empty / "-" / "—" skip; integer accept; comma strip; decimals/negative ERROR. */
function parseCellAmount(
  raw: unknown
): { kind: 'skip' } | { kind: 'ok'; value: number } | { kind: 'error'; reason: string } {
  const v = unwrapCell(raw);
  if (v === null || v === undefined) return { kind: 'skip' };
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s === '-' || s === '—') return { kind: 'skip' };
    const cleaned = s.replace(/,/g, '').trim();
    if (/\./.test(cleaned)) return { kind: 'error', reason: 'Decimals not allowed' };
    const n = Number(cleaned);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return { kind: 'error', reason: 'Not a valid integer' };
    return { kind: 'ok', value: n };
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { kind: 'error', reason: 'Invalid number' };
    if (Math.round(v) !== v) return { kind: 'error', reason: 'Decimals not allowed' };
    if (v < 0) return { kind: 'error', reason: 'Negative amount' };
    return { kind: 'ok', value: Math.round(v) };
  }
  return { kind: 'error', reason: 'Text not allowed' };
}

function excelDateToDateKey(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    return formatDateRiyadh(toRiyadhDateOnly(raw));
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date((raw - 25569) * 86400 * 1000);
    return formatDateRiyadh(toRiyadhDateOnly(d));
  }
  const s = String(raw).trim();
  if (!s) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) return s;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return formatDateRiyadh(toRiyadhDateOnly(parsed));
  return null;
}

const MAX_ERRORS = 50;

export function parseMonthlySheetExcel(
  buffer: Buffer,
  monthKey: string
): ParseMonthlySheetResult {
  const sheetName = sheetNameFromMonth(monthKey);
  if (!sheetName) {
    return { ok: false, error: 'Invalid month (use YYYY-MM)' };
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return { ok: false, error: 'Invalid Excel file' };
  }
  return parseOneMonthlySheet(workbook, sheetName);
}
