/**
 * MSR "Data" sheet — employees as columns (not rows).
 * Uses raw cell values only (no pivot); ignores metric/total columns (AVT, AVP, UPT, totals, etc.).
 *
 * **MSR V2**: fixed employee column set (canonical names); row filtering; Total Sale After validation.
 */

import * as XLSX from 'xlsx';
import { dateKeyUTC, parseExcelDateToYMD, ymdToUTCNoon } from '@/lib/dates/safeCalendar';
import { extractEmpIdFromHeader, normalizeForMatch } from '@/lib/sales/parseMatrixTemplateExcel';

const MAX_HEADER_SCAN = 15;

/** Controlled columns for MSR Import V2 (exact template). Order is not significant; headers matched loosely. */
export const MSR_V2_CANONICAL_EMPLOYEES = [
  'Abdulaziz',
  'Hussain',
  'Muslim',
  'AlAnoud',
  'Abdulhadi',
] as const;

export type MsrV2CanonicalEmployee = (typeof MSR_V2_CANONICAL_EMPLOYEES)[number];

export type MsrV2ColumnMap = {
  dateCol: number;
  /** Canonical display name → column index */
  employeeColByCanonical: Map<MsrV2CanonicalEmployee, number>;
  /** -1 if column absent */
  totalSaleAfterCol: number;
};

export type MsrV2TotalMismatch = {
  rowNumber: number;
  dateKey: string;
  sumEmployees: number;
  sheetTotal: number;
  delta: number;
};

export type MsrV2ParseStats = {
  totalRowsScanned: number;
  validRowsProcessed: number;
  skippedEmptyRows: number;
  skippedSummaryRows: number;
  skippedNoNumericEmployeeRows: number;
  skippedMonthFilteredRows: number;
  skippedInvalidDateRows: number;
  invalidSalesValuesInValidRows: number;
  rowsGenerated: number;
};

export type MsrV2SheetParse = {
  rows: MsrTemplateRow[];
  stats: MsrV2ParseStats;
  totalMismatchWarnings: MsrV2TotalMismatch[];
};

export type MsrTemplateRow = {
  dateKey: string;
  date: Date;
  employeeHeader: string;
  sales: number;
  sourceRowNumber: number;
  columnIndex: number;
};

export type MsrSheetLayout =
  | { kind: 'legacy_msr'; headerIndex: number; header: string[] }
  | { kind: 'template_columns'; headerIndex: number; header: string[] }
  | null;

function unwrapCell(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('v' in o) return o.v;
    if ('value' in o) return o.value;
    if ('w' in o) return o.w;
  }
  return raw;
}

/** True if this header should not be treated as an employee name column. */
export function isIgnoredMsrMetricColumn(headerRaw: string): boolean {
  const s = String(headerRaw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!s) return true;
  if (/^\d+$/.test(s.replace(/\s/g, ''))) return true;

  const exact = new Set([
    'avt',
    'avp',
    'upt',
    'avg',
    'average',
    'mtd',
    'ytd',
    'dow',
    'notes',
    'note',
    '#',
    'no',
    'no.',
  ]);
  if (exact.has(s)) return true;
  if (s === 'day' || s === 'week' || s === 'month' || s === 'year') return true;
  if (s.startsWith('total') || s.includes('total sale') || s.includes('grand total')) return true;
  if (s.startsWith('pivot') || s.includes('slicer')) return true;
  if (s.includes('%') || s.endsWith('percent') || s.includes('margin')) return true;
  if (s.startsWith('comment')) return true;
  return false;
}

export function findDateColumnIndex(header: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const t = String(header[i] ?? '')
      .trim()
      .toLowerCase();
    if (t === 'date') return i;
  }
  for (let i = 0; i < header.length; i++) {
    const t = String(header[i] ?? '')
      .trim()
      .toLowerCase();
    if (t.includes('date') && !t.includes('update')) return i;
  }
  return -1;
}

function findTotalSaleAfterColumnIndex(header: string[]): number {
  return header.findIndex((h) => String(h ?? '').trim().toLowerCase().includes('total sale after'));
}

export function headerMatchesMsrV2Canonical(
  headerCell: string,
  canonical: MsrV2CanonicalEmployee
): boolean {
  const raw = String(headerCell ?? '').trim();
  if (!raw) return false;
  const h = normalizeForMatch(raw);
  const c = normalizeForMatch(canonical);
  const hCompact = h.replace(/\s+/g, '');
  const cCompact = c.replace(/\s+/g, '');
  if (h === c || hCompact === cCompact) return true;
  const hFirst = h.split(/\s+/)[0] ?? '';
  const cFirst = c.split(/\s+/)[0] ?? '';
  return Boolean(hFirst && cFirst && hFirst === cFirst);
}

/** Resolves fixed V2 employee columns + Date + Total Sale After (optional). All five must map to distinct columns. */
export function resolveMsrV2ColumnMap(header: string[]): MsrV2ColumnMap | null {
  const dateCol = findDateColumnIndex(header);
  if (dateCol < 0) return null;
  const employeeColByCanonical = new Map<MsrV2CanonicalEmployee, number>();
  for (const name of MSR_V2_CANONICAL_EMPLOYEES) {
    let found = -1;
    for (let c = 0; c < header.length; c++) {
      if (c === dateCol) continue;
      if (headerMatchesMsrV2Canonical(header[c] ?? '', name)) {
        found = c;
        break;
      }
    }
    if (found < 0) return null;
    employeeColByCanonical.set(name, found);
  }
  const indices = Array.from(employeeColByCanonical.values());
  if (new Set(indices).size !== indices.length) return null;
  return {
    dateCol,
    employeeColByCanonical,
    totalSaleAfterCol: findTotalSaleAfterColumnIndex(header),
  };
}

/**
 * Layout:
 * - **template_columns**: MSR V2 header row (Date + five fixed employees).
 * - **legacy_msr**: Date + Total Sale After (empId columns after total).
 */
export function detectMsrDataSheetLayout(rows: unknown[][]): MsrSheetLayout {
  const max = Math.min(rows.length, MAX_HEADER_SCAN);
  for (let r = 0; r < max; r++) {
    const cells = (rows[r] ?? []).map((c) => String(unwrapCell(c) ?? '').trim());
    if (cells.length === 0) continue;
    if (resolveMsrV2ColumnMap(cells)) {
      return { kind: 'template_columns', headerIndex: r, header: cells };
    }
  }
  for (let r = 0; r < max; r++) {
    const cells = (rows[r] ?? []).map((c) => String(unwrapCell(c) ?? '').trim());
    if (cells.length === 0) continue;
    const dateCol = findDateColumnIndex(cells);
    if (dateCol < 0) continue;
    const totalAfterCol = findTotalSaleAfterColumnIndex(cells);
    if (totalAfterCol >= 0) {
      return { kind: 'legacy_msr', headerIndex: r, header: cells };
    }
  }
  return null;
}

function parseSalesCell(raw: unknown):
  | { kind: 'skip' }
  | { kind: 'ok'; value: number }
  | { kind: 'invalid' } {
  const v = unwrapCell(raw);
  if (v === null || v === undefined) return { kind: 'skip' };
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s === '-' || s === '—' || s === ' ') return { kind: 'skip' };
    const cleaned = s.replace(/,/g, '').trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { kind: 'invalid' };
    const rounded = Math.round(n);
    if (rounded <= 0) return { kind: 'skip' };
    if (Math.abs(n - rounded) > 1e-9) return { kind: 'invalid' };
    return { kind: 'ok', value: rounded };
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { kind: 'invalid' };
    const rounded = Math.round(v);
    if (rounded <= 0) return { kind: 'skip' };
    if (Math.abs(v - rounded) > 1e-9) return { kind: 'invalid' };
    return { kind: 'ok', value: rounded };
  }
  return { kind: 'invalid' };
}

export const MSR_V2_TOTAL_TOLERANCE_SAR = 1;

function isRowEffectivelyEmpty(rowArr: unknown[], maxColInclusive: number): boolean {
  const lim = Math.max(0, maxColInclusive);
  for (let c = 0; c <= lim; c++) {
    const v = unwrapCell(rowArr[c]);
    if (v != null && String(v).trim() !== '') return false;
  }
  return true;
}

function isSummaryLikeDateValue(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (!s) return false;
    return (
      /\btotal\b/.test(s) ||
      /\bsubtotal\b/.test(s) ||
      /\bgrand\b/.test(s) ||
      /\bsummary\b/.test(s) ||
      /المجموع/.test(s)
    );
  }
  return false;
}

function parseTotalSaleAfterCell(raw: unknown): number | null {
  const v = unwrapCell(raw);
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const r = Math.round(v);
    return Math.abs(v - r) < 1e-9 ? r : null;
  }
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    if (s === '' || s === '-' || s === '—') return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    return Math.abs(n - rounded) < 1e-9 ? rounded : null;
  }
  return null;
}

/** MSR Import V2: fixed five employees, row filtering, optional Total Sale After reconciliation. */
export function parseMsrTemplateV2FromAoa(
  aoa: unknown[][],
  opts: {
    headerRowIndex: number;
    columnMap: MsrV2ColumnMap;
    monthFilter?: string | null;
    maxDataRows?: number;
  }
): MsrV2SheetParse {
  const maxDataRows = opts.maxDataRows ?? 5000;
  const { columnMap } = opts;
  const empIndices = Array.from(columnMap.employeeColByCanonical.values());
  const maxIdx = Math.max(
    columnMap.dateCol,
    ...empIndices,
    columnMap.totalSaleAfterCol >= 0 ? columnMap.totalSaleAfterCol : 0
  );

  const rows: MsrTemplateRow[] = [];
  const totalMismatchWarnings: MsrV2TotalMismatch[] = [];
  const stats: MsrV2ParseStats = {
    totalRowsScanned: 0,
    validRowsProcessed: 0,
    skippedEmptyRows: 0,
    skippedSummaryRows: 0,
    skippedNoNumericEmployeeRows: 0,
    skippedMonthFilteredRows: 0,
    skippedInvalidDateRows: 0,
    invalidSalesValuesInValidRows: 0,
    rowsGenerated: 0,
  };

  const dataStart = opts.headerRowIndex + 1;
  const limit = Math.min(aoa.length, dataStart + maxDataRows);

  for (let r = dataStart; r < limit; r++) {
    const rowArr = aoa[r] ?? [];
    stats.totalRowsScanned += 1;

    if (isRowEffectivelyEmpty(rowArr, maxIdx)) {
      stats.skippedEmptyRows += 1;
      continue;
    }

    const dateRaw = rowArr[columnMap.dateCol];
    if (isSummaryLikeDateValue(dateRaw)) {
      stats.skippedSummaryRows += 1;
      continue;
    }

    let dateKey: string;
    let date: Date;
    try {
      const ymd = parseExcelDateToYMD(unwrapCell(dateRaw));
      date = ymdToUTCNoon(ymd);
      dateKey = dateKeyUTC(date);
    } catch {
      stats.skippedInvalidDateRows += 1;
      continue;
    }

    if (opts.monthFilter && /^\d{4}-\d{2}$/.test(opts.monthFilter)) {
      if (!dateKey.startsWith(`${opts.monthFilter}-`)) {
        stats.skippedMonthFilteredRows += 1;
        continue;
      }
    }

    const amounts: { canonical: MsrV2CanonicalEmployee; col: number; value: number }[] = [];
    let hadInvalidSalesCell = false;
    for (const name of MSR_V2_CANONICAL_EMPLOYEES) {
      const col = columnMap.employeeColByCanonical.get(name)!;
      const parsed = parseSalesCell(rowArr[col]);
      if (parsed.kind === 'ok') {
        amounts.push({ canonical: name, col, value: parsed.value });
      } else if (parsed.kind === 'invalid') {
        hadInvalidSalesCell = true;
      }
    }

    if (amounts.length === 0) {
      stats.skippedNoNumericEmployeeRows += 1;
      continue;
    }

    stats.validRowsProcessed += 1;
    if (hadInvalidSalesCell) {
      stats.invalidSalesValuesInValidRows += 1;
    }

    const sumEmployees = amounts.reduce((acc, x) => acc + x.value, 0);
    if (columnMap.totalSaleAfterCol >= 0) {
      const sheetTotal = parseTotalSaleAfterCell(rowArr[columnMap.totalSaleAfterCol]);
      if (
        sheetTotal != null &&
        Math.abs(sumEmployees - sheetTotal) > MSR_V2_TOTAL_TOLERANCE_SAR
      ) {
        totalMismatchWarnings.push({
          rowNumber: r + 1,
          dateKey,
          sumEmployees,
          sheetTotal,
          delta: sumEmployees - sheetTotal,
        });
      }
    }

    for (const a of amounts) {
      rows.push({
        dateKey,
        date,
        employeeHeader: a.canonical,
        sales: a.value,
        sourceRowNumber: r + 1,
        columnIndex: a.col,
      });
      stats.rowsGenerated += 1;
    }
  }

  return { rows, stats, totalMismatchWarnings };
}

export function readMsrDataSheetAoaFromBuffer(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: true, cellNF: false, cellText: false });
  const dataSheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'data');
  if (!dataSheetName) throw new Error("Sheet 'Data' not found");
  const sheet = wb.Sheets[dataSheetName];
  if (!sheet) throw new Error("Sheet 'Data' not found");
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  }) as unknown[][];
}

function norm(h: string): string {
  return normalizeForMatch(h);
}

export type MsrTemplateMatchCandidate = { userId: string; empId: string; boutiqueId: string; name: string };

/** Match header to exactly one operational user; null if zero or ambiguous. */
export function resolveTemplateHeaderToUniqueUser(
  headerRaw: string,
  candidates: MsrTemplateMatchCandidate[],
  validEmpIds: Set<string>
): MsrTemplateMatchCandidate | null {
  const label = String(headerRaw ?? '').trim();
  if (!label) return null;

  const fromEmp = extractEmpIdFromHeader(label);
  if (fromEmp) {
    const matches = candidates.filter(
      (c) => c.empId.trim().toLowerCase() === fromEmp.trim().toLowerCase()
    );
    return matches.length === 1 ? matches[0]! : null;
  }

  if (validEmpIds.has(label)) {
    const matches = candidates.filter((c) => c.empId === label);
    return matches.length === 1 ? matches[0]! : null;
  }

  const h = norm(label);
  if (!h) return null;

  const matches: MsrTemplateMatchCandidate[] = [];
  for (const c of candidates) {
    const empId = c.empId.trim();
    const name = c.name.trim();
    if (!empId) continue;
    const n = norm(name);
    const first = n.split(/\s+/)[0] ?? '';
    const noSpace = n.replace(/\s+/g, '');
    const headerNoSpace = h.replace(/\s+/g, '');
    if (n && h === n) matches.push(c);
    else if (first && h === first) matches.push(c);
    else if (noSpace && headerNoSpace === noSpace) matches.push(c);
    else if (n && n.includes(h)) matches.push(c);
  }

  const uniq = new Map<string, MsrTemplateMatchCandidate>();
  for (const m of matches) uniq.set(m.userId, m);
  if (uniq.size !== 1) return null;
  return Array.from(uniq.values())[0]!;
}
