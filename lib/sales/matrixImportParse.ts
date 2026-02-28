/**
 * Shared matrix import parsing (DATA_MATRIX sheet, AOA).
 * Used by /api/sales/import/preview and /api/sales/import/apply.
 */

import * as XLSX from 'xlsx';
import type { PrismaClient } from '@prisma/client';
import { extractEmpIdFromHeader, normalizeForMatch } from '@/lib/sales/parseMatrixTemplateExcel';

const SHEET_NAME = 'DATA_MATRIX';
const HEADER_ROW_INDEX = 0;
const DATA_START_ROW = 1;
const SCOPE_COL = 0;
const DATE_COL = 1;
const EMPLOYEE_START_COL = 3;

export type BlockingError = {
  type: string;
  message: string;
  row: number;
  col: number;
  headerRaw?: string;
  value?: unknown;
};

export type ParseResult = {
  month: string;
  scopeId: string;
  sheetName: string;
  header: string[];
  employeeColumns: { colIndex: number; headerRaw: string }[];
  rows: { dateKey: string; date: Date; scopeId: string; values: { colIndex: number; headerRaw: string; amountSar: number }[]; skippedEmpty: number }[];
  queue: { dateKey: string; date: Date; employeeId: string; amountSar: number }[];
  blockingErrors: BlockingError[];
  sampleNonBlankCells: { row: number; col: number; headerRaw: string; value: unknown }[];
  mappedEmployees: { colIndex: number; headerRaw: string; employeeId: string; employeeName: string }[];
  unmappedEmployees: { colIndex: number; headerRaw: string; normalized: string }[];
  skippedEmpty: number;
  headerCellCount: number;
  employeeEndCol: number;
  rowCount: number;
  firstRowWithDataSample: { r: number; c: number; header: string; v: string }[];
  applyAllowed: boolean;
  applyBlockReasons: string[];
};

function isStopHeader0(hRaw: unknown): boolean {
  const s = String(hRaw ?? '').trim().toLowerCase();
  if (!s) return true;
  if (s === 'total' || s.startsWith('total')) return true;
  if (s === 'notes' || s.startsWith('notes')) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

function isBlankOrDash(v: unknown): boolean {
  if (v == null) return true;
  const t = String(v).trim();
  return t === '' || t === '-';
}

function toDateKey(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const utcMs = (raw - 25569) * 86400 * 1000;
    const d = new Date(utcMs);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (raw instanceof Date && !Number.isNaN((raw as Date).getTime())) {
    return (raw as Date).toISOString().slice(0, 10);
  }
  return null;
}

function parseIntSarOrBlocking(
  raw: unknown,
  row: number,
  col: number,
  headerRaw: string
): { ok: true; value: number } | { ok: false; err: BlockingError } {
  const t = String(raw ?? '').trim().replace(/,/g, '');
  if (/^-?\d+\.\d+$/.test(t)) {
    return { ok: false, err: { type: 'DECIMAL', message: 'Decimal values are not allowed (must be integer SAR).', row, col, headerRaw, value: raw } };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return { ok: false, err: { type: 'NOT_A_NUMBER', message: 'Value is not a number.', row, col, headerRaw, value: raw } };
  }
  if (!Number.isInteger(n)) {
    return { ok: false, err: { type: 'DECIMAL', message: 'Non-integer value is not allowed.', row, col, headerRaw, value: raw } };
  }
  if (n < 0) {
    return { ok: false, err: { type: 'NEGATIVE', message: 'Negative values are not allowed.', row, col, headerRaw, value: raw } };
  }
  return { ok: true, value: n };
}

function previousMonthKey(monthKey: string): string | null {
  const [y, m] = monthKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function norm(h: string): string {
  return normalizeForMatch(h);
}

function resolveHeaderToEmployee(
  headerRaw: string,
  employees: { empId: string; name: string | null }[]
): { empId: string; employeeName: string } | null {
  const empIdFromHeader = extractEmpIdFromHeader(headerRaw);
  if (empIdFromHeader) {
    const e = employees.find((x) => (x.empId ?? '').trim().toLowerCase() === empIdFromHeader.toLowerCase());
    if (e) return { empId: e.empId, employeeName: (e.name ?? '').trim() || e.empId };
  }
  const h = norm(headerRaw);
  if (!h) return null;
  for (const e of employees) {
    const empId = (e.empId ?? '').trim();
    const name = (e.name ?? '').trim();
    if (!empId) continue;
    const n = norm(name);
    const first = n.split(/\s+/)[0] ?? '';
    const noSpace = n.replace(/\s+/g, '');
    const headerNoSpace = h.replace(/\s+/g, '');
    if (n && h === n) return { empId, employeeName: name };
    if (first && h === first) return { empId, employeeName: name };
    if (noSpace && headerNoSpace === noSpace) return { empId, employeeName: name };
    if (n && n.includes(h)) return { empId, employeeName: name };
  }
  return null;
}

async function isMonthLocked(prisma: PrismaClient, boutiqueId: string, year: number, month: number): Promise<boolean> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const found = await prisma.boutiqueSalesSummary.findFirst({
    where: { boutiqueId, date: { gte: start, lte: end }, status: 'LOCKED' },
    select: { id: true },
  });
  return !!found;
}

export async function parseMatrixBuffer(
  buf: Buffer,
  opts: { scopeId: string; month: string; includePreviousMonth: boolean },
  prisma: PrismaClient
): Promise<ParseResult> {
  const { scopeId, month, includePreviousMonth } = opts;
  const [year, monthNum] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));
  let rangeStart = monthStart;
  const rangeEnd = monthEnd;
  if (includePreviousMonth) {
    const prev = previousMonthKey(month);
    if (prev) {
      const [py, pm] = prev.split('-').map(Number);
      rangeStart = new Date(Date.UTC(py, pm - 1, 1));
    }
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: true });
  } catch {
    throw new Error('Invalid Excel file');
  }
  const sheetNameFound = wb.SheetNames.find((n) => n.trim().toUpperCase() === SHEET_NAME.toUpperCase());
  const ws = sheetNameFound ? wb.Sheets[sheetNameFound] : undefined;
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false, raw: true }) as unknown[][];
  const header = (aoa[HEADER_ROW_INDEX] ?? []).map((x) => String(x ?? '').trim());

  let employeeEndCol = EMPLOYEE_START_COL;
  for (let c = EMPLOYEE_START_COL; c < header.length; c++) {
    if (isStopHeader0(header[c])) {
      employeeEndCol = c - 1;
      break;
    }
    employeeEndCol = c;
  }

  if (employeeEndCol < EMPLOYEE_START_COL) {
    throw new Error('NO_EMPLOYEE_COLUMNS');
  }

  const employeeColumns: { colIndex: number; headerRaw: string }[] = [];
  for (let c = EMPLOYEE_START_COL; c <= employeeEndCol; c++) {
    const headerRaw = header[c] ?? '';
    if (headerRaw) employeeColumns.push({ colIndex: c, headerRaw });
  }

  const blockingErrors: BlockingError[] = [];
  const sampleNonBlankCells: { row: number; col: number; headerRaw: string; value: unknown }[] = [];
  const SAMPLE_MAX = 12;
  const rows: { dateKey: string; date: Date; scopeId: string; values: { colIndex: number; headerRaw: string; amountSar: number }[]; skippedEmpty: number }[] = [];

  for (let r = DATA_START_ROW; r < aoa.length; r++) {
    const rowArr = aoa[r] ?? [];
    const dateRaw = rowArr[DATE_COL];
    const dateKey = toDateKey(dateRaw);
    if (!dateKey) {
      if (dateRaw != null && String(dateRaw).trim() !== '') {
        blockingErrors.push({
          type: 'INVALID_DATE',
          message: `Invalid date format: ${String(dateRaw).slice(0, 50)}`,
          row: r + 1,
          col: DATE_COL + 1,
          headerRaw: 'Date',
          value: dateRaw,
        });
      }
      continue;
    }
    const date = new Date(dateKey + 'T00:00:00.000Z');
    const rowScopeId = String(rowArr[SCOPE_COL] ?? '').trim();

    const values: { colIndex: number; headerRaw: string; amountSar: number }[] = [];
    let skippedEmpty = 0;

    for (const { colIndex, headerRaw } of employeeColumns) {
      const raw = (aoa[r] ?? [])[colIndex] ?? null;
      if (isBlankOrDash(raw)) {
        skippedEmpty++;
        continue;
      }
      if (sampleNonBlankCells.length < SAMPLE_MAX) {
        sampleNonBlankCells.push({ row: r + 1, col: colIndex + 1, headerRaw, value: raw });
      }
      const parsed = parseIntSarOrBlocking(raw, r + 1, colIndex + 1, headerRaw);
      if (!parsed.ok) {
        blockingErrors.push(parsed.err);
        continue;
      }
      values.push({ colIndex, headerRaw, amountSar: parsed.value });
    }
    rows.push({ dateKey, date, scopeId: rowScopeId, values, skippedEmpty });
  }

  const firstRowWithDataSample: { r: number; c: number; header: string; v: string }[] = [];
  for (let r = DATA_START_ROW; r <= Math.min(14, aoa.length - 1); r++) {
    for (let c = EMPLOYEE_START_COL; c <= Math.min(EMPLOYEE_START_COL + 2, employeeEndCol); c++) {
      const raw = (aoa[r] ?? [])[c] ?? null;
      if (isBlankOrDash(raw)) continue;
      const v = String(raw).trim();
      if (!v || v === '-') continue;
      firstRowWithDataSample.push({ r: r + 1, c: c + 1, header: header[c] ?? '', v });
      if (firstRowWithDataSample.length >= 8) break;
    }
    if (firstRowWithDataSample.length >= 8) break;
  }

  const employees = await prisma.employee.findMany({
    where: { boutiqueId: scopeId },
    select: { empId: true, name: true },
  });

  const mappedEmployees: { colIndex: number; headerRaw: string; employeeId: string; employeeName: string }[] = [];
  const unmappedEmployees: { colIndex: number; headerRaw: string; normalized: string }[] = [];
  const headerToEmpId = new Map<string, string>();

  for (const { colIndex, headerRaw } of employeeColumns) {
    const resolved = resolveHeaderToEmployee(headerRaw, employees);
    if (resolved) {
      headerToEmpId.set(norm(headerRaw), resolved.empId);
      mappedEmployees.push({ colIndex, headerRaw, employeeId: resolved.empId, employeeName: resolved.employeeName });
    } else {
      unmappedEmployees.push({ colIndex, headerRaw, normalized: norm(headerRaw) });
    }
  }

  const allowedDateSet = new Set<string>();
  for (let d = new Date(rangeStart.getTime()); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    allowedDateSet.add(d.toISOString().slice(0, 10));
  }
  if (includePreviousMonth) {
    const prev = previousMonthKey(month);
    if (prev) {
      const [py, pm] = prev.split('-').map(Number);
      const pStart = new Date(Date.UTC(py, pm - 1, 1));
      const pEnd = new Date(Date.UTC(py, pm, 0));
      for (let d = new Date(pStart.getTime()); d <= pEnd; d.setUTCDate(d.getUTCDate() + 1)) {
        allowedDateSet.add(d.toISOString().slice(0, 10));
      }
    }
  }

  const queue: { dateKey: string; date: Date; employeeId: string; amountSar: number }[] = [];
  let skippedEmpty = 0;
  for (const row of rows) {
    if (String(row.scopeId ?? '').trim() !== scopeId) continue;
    if (!allowedDateSet.has(row.dateKey)) continue;
    skippedEmpty += row.skippedEmpty;
    for (const v of row.values) {
      const empId = headerToEmpId.get(norm(v.headerRaw));
      if (!empId) continue;
      queue.push({ dateKey: row.dateKey, date: row.date, employeeId: empId, amountSar: v.amountSar });
    }
  }

  const mappedCount = headerToEmpId.size;
  const monthLockedSelected = await isMonthLocked(prisma, scopeId, year, monthNum);
  let monthLockedPrev = false;
  if (includePreviousMonth) {
    const prev = previousMonthKey(month);
    if (prev) {
      const [py, pm] = prev.split('-').map(Number);
      monthLockedPrev = await isMonthLocked(prisma, scopeId, py, pm);
    }
  }
  const monthLocked = monthLockedSelected || monthLockedPrev;

  const applyBlockReasons: string[] = [];
  if (blockingErrors.length > 0) applyBlockReasons.push('BLOCKING_ERRORS');
  if (mappedCount === 0) applyBlockReasons.push('NO_MAPPED_EMPLOYEES');
  if (monthLocked) applyBlockReasons.push('MONTH_LOCKED');
  const applyAllowed = applyBlockReasons.length === 0;

  return {
    month,
    scopeId,
    sheetName: SHEET_NAME,
    header,
    employeeColumns,
    rows,
    queue,
    blockingErrors,
    sampleNonBlankCells,
    mappedEmployees,
    unmappedEmployees,
    skippedEmpty,
    headerCellCount: header.length,
    employeeEndCol,
    rowCount: aoa.length,
    firstRowWithDataSample,
    applyAllowed,
    applyBlockReasons,
  };
}
