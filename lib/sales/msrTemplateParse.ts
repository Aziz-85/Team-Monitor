/**
 * MSR "Data" sheet — employees as columns (not rows).
 * Uses raw cell values only (no pivot); ignores metric/total columns (AVT, AVP, UPT, totals, etc.).
 */

import * as XLSX from 'xlsx';
import { dateKeyUTC, parseExcelDateToYMD, ymdToUTCNoon } from '@/lib/dates/safeCalendar';
import { extractEmpIdFromHeader, normalizeForMatch } from '@/lib/sales/parseMatrixTemplateExcel';

const MAX_HEADER_SCAN = 15;

export type MsrTemplateRow = {
  dateKey: string;
  date: Date;
  employeeHeader: string;
  sales: number;
  sourceRowNumber: number;
  columnIndex: number;
};

export type MsrTemplateParseStats = {
  rowsRead: number;
  rowsGenerated: number;
  invalidDateRows: number;
  emptyOrNonNumericSkipped: number;
  invalidSalesValues: number;
};

export type MsrTemplateSheetParse = MsrTemplateParseStats & {
  rows: MsrTemplateRow[];
  headerRowIndex: number;
  dateCol: number;
  employeeColumnIndices: number[];
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

function normHeader(s: string): string {
  return normalizeForMatch(s);
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

function isEmptyOrNumericHeader(headerRaw: string): boolean {
  const h = String(headerRaw ?? '').trim();
  if (!h) return true;
  if (/^\d+$/.test(normHeader(h).replace(/\s/g, ''))) return true;
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

/**
 * Layout rules:
 * - **Legacy**: row has "Total Sale After" and no name-like employee columns *between* Date and that column
 *   (employee empIds are read only from columns after Total Sale After).
 * - **Template**: name-like columns between Date and Total Sale After, OR sheet has no Total Sale After and
 *   has name-like columns after Date (employees as headers, metrics like AVT/UPT ignored).
 */
export function detectMsrDataSheetLayout(rows: unknown[][]): MsrSheetLayout {
  const max = Math.min(rows.length, MAX_HEADER_SCAN);
  for (let r = 0; r < max; r++) {
    const cells = (rows[r] ?? []).map((c) => String(unwrapCell(c) ?? '').trim());
    if (cells.length === 0) continue;
    const dateCol = findDateColumnIndex(cells);
    if (dateCol < 0) continue;

    const totalAfterCol = findTotalSaleAfterColumnIndex(cells);

    const collectNameLike = (from: number, toExclusive: number): number[] => {
      const out: number[] = [];
      for (let c = from; c < toExclusive; c++) {
        const h = cells[c] ?? '';
        if (isIgnoredMsrMetricColumn(h)) continue;
        if (isEmptyOrNumericHeader(h)) continue;
        out.push(c);
      }
      return out;
    };

    if (totalAfterCol >= 0) {
      const betweenDateAndTotal = collectNameLike(dateCol + 1, totalAfterCol);
      if (betweenDateAndTotal.length > 0) {
        return { kind: 'template_columns', headerIndex: r, header: cells };
      }
      return { kind: 'legacy_msr', headerIndex: r, header: cells };
    }

    const afterDate = collectNameLike(dateCol + 1, cells.length);
    if (afterDate.length > 0) {
      return { kind: 'template_columns', headerIndex: r, header: cells };
    }
  }
  return null;
}

/** Employee columns for template layout: every column after Date whose header is not ignored. */
export function resolveTemplateEmployeeColumnIndices(header: string[], dateCol: number): number[] {
  const cols: number[] = [];
  for (let c = dateCol + 1; c < header.length; c++) {
    const h = header[c] ?? '';
    if (isIgnoredMsrMetricColumn(h)) continue;
    if (isEmptyOrNumericHeader(h)) continue;
    cols.push(c);
  }
  return cols;
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

export function parseMsrTemplateDataSheetFromAoa(
  aoa: unknown[][],
  opts: { headerRowIndex: number; monthFilter?: string | null; maxDataRows?: number }
): MsrTemplateSheetParse {
  const maxDataRows = opts.maxDataRows ?? 5000;
  const header = (aoa[opts.headerRowIndex] ?? []).map((c) => String(unwrapCell(c) ?? '').trim());
  const dateCol = findDateColumnIndex(header);
  if (dateCol < 0) {
    return {
      rows: [],
      headerRowIndex: opts.headerRowIndex,
      dateCol: -1,
      employeeColumnIndices: [],
      rowsRead: 0,
      rowsGenerated: 0,
      invalidDateRows: 0,
      emptyOrNonNumericSkipped: 0,
      invalidSalesValues: 0,
    };
  }
  const employeeColumnIndices = resolveTemplateEmployeeColumnIndices(header, dateCol);
  const rows: MsrTemplateRow[] = [];
  let rowsRead = 0;
  let invalidDateRows = 0;
  let emptyOrNonNumericSkipped = 0;
  let invalidSalesValues = 0;
  const dataStart = opts.headerRowIndex + 1;
  const limit = Math.min(aoa.length, dataStart + maxDataRows);

  for (let r = dataStart; r < limit; r++) {
    const rowArr = aoa[r] ?? [];
    const dateRaw = rowArr[dateCol];
    rowsRead += 1;
    let dateKey: string;
    let date: Date;
    try {
      const ymd = parseExcelDateToYMD(unwrapCell(dateRaw));
      date = ymdToUTCNoon(ymd);
      dateKey = dateKeyUTC(date);
    } catch {
      invalidDateRows += 1;
      continue;
    }
    if (opts.monthFilter && /^\d{4}-\d{2}$/.test(opts.monthFilter)) {
      if (!dateKey.startsWith(`${opts.monthFilter}-`)) {
        continue;
      }
    }

    for (const c of employeeColumnIndices) {
      const headerLabel = String(header[c] ?? '').trim();
      const parsed = parseSalesCell(rowArr[c]);
      if (parsed.kind === 'skip') {
        emptyOrNonNumericSkipped += 1;
        continue;
      }
      if (parsed.kind === 'invalid') {
        invalidSalesValues += 1;
        continue;
      }
      rows.push({
        dateKey,
        date,
        employeeHeader: headerLabel,
        sales: parsed.value,
        sourceRowNumber: r + 1,
        columnIndex: c,
      });
    }
  }

  return {
    rows,
    headerRowIndex: opts.headerRowIndex,
    dateCol,
    employeeColumnIndices,
    rowsRead,
    rowsGenerated: rows.length,
    invalidDateRows,
    emptyOrNonNumericSkipped,
    invalidSalesValues,
  };
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
