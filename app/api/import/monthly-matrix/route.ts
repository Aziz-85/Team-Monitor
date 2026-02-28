/**
 * POST /api/import/monthly-matrix
 * Matrix Template Import — sheet "DATA_MATRIX" only (.xlsx). Uses XLSX sheet_to_json (aoa) with defval: null.
 * Columns: ScopeId (A), Date (B), Day (C), employee columns from D (0-based 3) until TOTAL/Notes/blank/numeric.
 * RBAC: ADMIN, MANAGER. Scope: operational boutique only.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { extractEmpIdFromHeader, normalizeForMatch } from '@/lib/sales/parseMatrixTemplateExcel';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { normalizeMonthKey } from '@/lib/time';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;

const SHEET_NAME = 'DATA_MATRIX';
const HEADER_ROW_INDEX = 0;   // row 1 in Excel
const DATA_START_ROW = 1;     // row 2 in Excel
const SCOPE_COL = 0;          // A (0-based)
const DATE_COL = 1;           // B (0-based)
const EMPLOYEE_START_COL = 3; // D (0-based)

type BlockingError = {
  type: string;
  message: string;
  row: number;
  col: number;
  headerRaw?: string;
  value?: unknown;
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

/** Normalize Excel date (Date, serial number, or YYYY-MM-DD string) to dateKey or null. */
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
    const d = excelSerialToDate(raw);
    return d ? d.toISOString().slice(0, 10) : null;
  }
  if (raw instanceof Date && !Number.isNaN((raw as Date).getTime())) {
    return (raw as Date).toISOString().slice(0, 10);
  }
  return null;
}

/** Excel serial (days since 1899-12-30) to Date (UTC). */
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  const utcMs = (serial - 25569) * 86400 * 1000;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseIntSarOrBlocking(
  raw: unknown,
  row: number,
  col: number,
  headerRaw: string
): { ok: true; value: number } | { ok: false; err: BlockingError } {
  const t = String(raw ?? '')
    .trim()
    .replace(/,/g, '');
  if (/^-?\d+\.\d+$/.test(t)) {
    return {
      ok: false,
      err: {
        type: 'DECIMAL',
        message: 'Decimal values are not allowed (must be integer SAR).',
        row,
        col,
        headerRaw,
        value: raw,
      },
    };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      err: {
        type: 'NOT_A_NUMBER',
        message: 'Value is not a number.',
        row,
        col,
        headerRaw,
        value: raw,
      },
    };
  }
  if (!Number.isInteger(n)) {
    return {
      ok: false,
      err: {
        type: 'DECIMAL',
        message: 'Non-integer value is not allowed.',
        row,
        col,
        headerRaw,
        value: raw,
      },
    };
  }
  if (n < 0) {
    return {
      ok: false,
      err: {
        type: 'NEGATIVE',
        message: 'Negative values are not allowed.',
        row,
        col,
        headerRaw,
        value: raw,
      },
    };
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

async function isMonthLocked(boutiqueId: string, year: number, month: number): Promise<boolean> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const found = await prisma.boutiqueSalesSummary.findFirst({
    where: {
      boutiqueId,
      date: { gte: start, lte: end },
      status: 'LOCKED',
    },
    select: { id: true },
  });
  return !!found;
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const scopeId = scopeResult.boutiqueId;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const monthParam = (formData.get('month') as string)?.trim() ?? '';
  const includePreviousMonth = (formData.get('includePreviousMonth') as string)?.toLowerCase() === 'true';
  const dryRunRaw = (formData.get('dryRun') as string)?.toLowerCase();
  const dryRun = dryRunRaw !== 'false';

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  const fileName = (file.name ?? '').toLowerCase();
  if (!fileName.endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Only .xlsx files are allowed for Matrix template' }, { status: 400 });
  }

  const month = normalizeMonthKey(monthParam);
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

  const buf = Buffer.from(await file.arrayBuffer());

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return NextResponse.json({
      success: false,
      error: 'Invalid Excel file',
      applyAllowed: false,
      applyBlockReasons: ['PARSE_ERROR'],
    }, { status: 400 });
  }

  const sheetNameFound = wb.SheetNames.find((n) => n.trim().toUpperCase() === SHEET_NAME.toUpperCase());
  const ws = sheetNameFound ? wb.Sheets[sheetNameFound] : undefined;
  if (!ws) {
    return NextResponse.json({
      success: false,
      error: `Sheet "${SHEET_NAME}" not found`,
      applyAllowed: false,
      applyBlockReasons: ['PARSE_ERROR'],
    }, { status: 400 });
  }

  const aoa = XLSX.utils.sheet_to_json(ws, {
    header: 1,        // Array of arrays
    defval: null,     // IMPORTANT: keep blanks as null
    blankrows: false,
  }) as unknown[][];

  const headerRowIndex = HEADER_ROW_INDEX;   // row 1 in Excel
  const dataStartRow = DATA_START_ROW;       // row 2 in Excel
  const header = (aoa[headerRowIndex] ?? []).map((x) => String(x ?? '').trim());
  // base cols: A,B,C => 0,1,2; employeeStartCol = 3 (D, 0-based)

  let employeeEndCol = EMPLOYEE_START_COL;
  for (let c = EMPLOYEE_START_COL; c < header.length; c++) {
    if (isStopHeader0(header[c])) {
      employeeEndCol = c - 1;
      break;
    }
    employeeEndCol = c;
  }

  if (employeeEndCol < EMPLOYEE_START_COL) {
    return NextResponse.json({
      success: false,
      dryRun,
      applyAllowed: false,
      applyBlockReasons: ['NO_EMPLOYEE_COLUMNS'],
      blockingErrorsCount: 1,
      blockingErrors: [{ type: 'NO_EMPLOYEE_COLUMNS', message: 'No employee columns found before TOTAL/Notes.' }],
      diagnostic: {
        headerCellCount: header.length,
        employeeStartCol: EMPLOYEE_START_COL + 1,
        employeeEndCol: employeeEndCol + 1,
        firstRowWithDataSample: [],
      },
    }, { status: 400 });
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

  for (let r = dataStartRow; r < aoa.length; r++) {
    const rowArr = aoa[r] ?? [];
    const dateRaw = rowArr[DATE_COL];
    const dateKey = toDateKey(dateRaw);
    if (!dateKey) {
      if (dateRaw != null && String(dateRaw).trim() !== '') {
        blockingErrors.push({
          type: 'INVALID_DATE',
          message: `Invalid date format (use YYYY-MM-DD or Excel date): ${String(dateRaw).slice(0, 50)}`,
          row: r + 1,
          col: DATE_COL + 1,
          headerRaw: 'Date',
          value: dateRaw,
        });
      }
      continue;
    }
    const date = new Date(dateKey + 'T00:00:00.000Z');
    const scopeId = String(rowArr[SCOPE_COL] ?? '').trim();

    const values: { colIndex: number; headerRaw: string; amountSar: number }[] = [];
    let skippedEmpty = 0;

    for (const { colIndex, headerRaw } of employeeColumns) {
      const raw = (aoa[r] ?? [])[colIndex] ?? null;

      if (isBlankOrDash(raw)) {
        skippedEmpty++;
        continue;
      }

      // sample nonblank
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

    rows.push({ dateKey, date, scopeId, values, skippedEmpty });
  }

  const firstRowWithDataSample: { r: number; c: number; header: string; v: string }[] = [];
  for (let r = dataStartRow; r <= Math.min(14, aoa.length - 1); r++) {
    for (let c = EMPLOYEE_START_COL; c <= Math.min(EMPLOYEE_START_COL + 2, employeeEndCol); c++) {
      const raw = (aoa[r] ?? [])[c] ?? null;
      if (isBlankOrDash(raw)) continue;
      const v = String(raw).trim();
      if (!v || v === '-') continue;
      firstRowWithDataSample.push({
        r: r + 1,
        c: c + 1,
        header: header[c] ?? '',
        v,
      });
      if (firstRowWithDataSample.length >= 8) break;
    }
    if (firstRowWithDataSample.length >= 8) break;
  }

  const sheetName = SHEET_NAME;
  const headerCellCount = header.length;
  const rowCount = aoa.length;

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
      mappedEmployees.push({
        colIndex,
        headerRaw,
        employeeId: resolved.empId,
        employeeName: resolved.employeeName,
      });
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
      queue.push({
        dateKey: row.dateKey,
        date: row.date,
        employeeId: empId,
        amountSar: v.amountSar,
      });
    }
  }

  const mappedCount = headerToEmpId.size;
  const monthLockedSelected = await isMonthLocked(scopeId, year, monthNum);
  let monthLockedPrev = false;
  if (includePreviousMonth) {
    const prev = previousMonthKey(month);
    if (prev) {
      const [py, pm] = prev.split('-').map(Number);
      monthLockedPrev = await isMonthLocked(scopeId, py, pm);
    }
  }
  const monthLocked = monthLockedSelected || monthLockedPrev;

  const applyBlockReasons: string[] = [];
  if (blockingErrors.length > 0) applyBlockReasons.push('BLOCKING_ERRORS');
  if (mappedCount === 0) applyBlockReasons.push('NO_MAPPED_EMPLOYEES');
  if (monthLocked) applyBlockReasons.push('MONTH_LOCKED');
  const applyAllowed = applyBlockReasons.length === 0;

  if (dryRun) {
    let inserted = 0;
    let updated = 0;
    const existing = await prisma.boutiqueSalesSummary.findMany({
      where: { boutiqueId: scopeId, date: { gte: rangeStart, lte: rangeEnd } },
      include: { lines: true },
    });
    const summaryByDate = new Map(existing.map((s) => [s.date.toISOString().slice(0, 10), s]));
    for (const item of queue) {
      const summary = summaryByDate.get(item.dateKey);
      const existed = summary?.lines.some((l) => l.employeeId === item.employeeId);
      if (existed) updated += 1;
      else inserted += 1;
    }

    return NextResponse.json({
      success: true,
      dryRun: true,
      month,
      includePreviousMonth,
      sheetName,
      headerRowIndex: 1,
      employeeStartCol: EMPLOYEE_START_COL + 1,
      employeeEndCol: employeeEndCol + 1,
      mappedEmployees,
      unmappedEmployees,
      inserted,
      updated,
      skippedEmpty,
      applyAllowed,
      applyBlockReasons,
      blockingErrorsCount: blockingErrors.length,
      blockingErrors: blockingErrors.slice(0, 50),
      sampleNonBlankCells: sampleNonBlankCells.slice(0, 12),
      diagnostic: {
        headerCellCount,
        employeeStartCol: EMPLOYEE_START_COL + 1,
        employeeEndCol: employeeEndCol + 1,
        totalRows: rowCount,
        totalCols: headerCellCount,
        recordsParsed: queue.length,
        firstRowWithDataSample,
      },
    });
  }

  if (!applyAllowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Apply not allowed',
        applyAllowed: false,
        applyBlockReasons,
        blockingErrorsCount: blockingErrors.length,
        blockingErrors: blockingErrors.slice(0, 50),
      },
      { status: 400 }
    );
  }

  let inserted = 0;
  let updated = 0;
  const uniqueDates = Array.from(new Set(queue.map((q) => q.dateKey))).sort();

  for (const dateKey of uniqueDates) {
    const dayQueue = queue.filter((q) => q.dateKey === dateKey);
    if (dayQueue.length === 0) continue;
    const date = dayQueue[0].date;

    let summary = await prisma.boutiqueSalesSummary.findUnique({
      where: { boutiqueId_date: { boutiqueId: scopeId, date } },
      include: { lines: true },
    });

    if (!summary) {
      summary = await prisma.boutiqueSalesSummary.create({
        data: {
          boutiqueId: scopeId,
          date,
          totalSar: 0,
          status: 'DRAFT',
          enteredById: user.id,
        },
        include: { lines: true },
      });
      await recordSalesLedgerAudit({
        boutiqueId: scopeId,
        date,
        actorId: user.id,
        action: 'SUMMARY_CREATE',
        metadata: { monthlyMatrixImport: true },
      });
    }

    if (summary.status === 'LOCKED') {
      await prisma.boutiqueSalesSummary.update({
        where: { id: summary.id },
        data: { status: 'DRAFT', lockedById: null, lockedAt: null },
      });
      await recordSalesLedgerAudit({
        boutiqueId: scopeId,
        date,
        actorId: user.id,
        action: 'POST_LOCK_EDIT',
        reason: 'Matrix import; auto-unlock',
        metadata: { monthlyMatrixImport: true },
      });
    }

    const existingByEmp = new Map(summary.lines.map((l) => [l.employeeId, l]));
    for (const item of dayQueue) {
      const existed = existingByEmp.has(item.employeeId);
      await prisma.boutiqueSalesLine.upsert({
        where: {
          summaryId_employeeId: { summaryId: summary.id, employeeId: item.employeeId },
        },
        create: {
          summaryId: summary.id,
          employeeId: item.employeeId,
          amountSar: item.amountSar,
          source: 'EXCEL_IMPORT',
        },
        update: {
          amountSar: item.amountSar,
          source: 'EXCEL_IMPORT',
          updatedAt: new Date(),
        },
      });
      if (existed) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }

    const linesAfter = await prisma.boutiqueSalesLine.findMany({
      where: { summaryId: summary.id },
      select: { amountSar: true },
    });
    const linesTotalSar = linesAfter.reduce((s, l) => s + l.amountSar, 0);
    const managerTotal = summary.totalSar ?? 0;
    if (managerTotal === 0) {
      await prisma.boutiqueSalesSummary.update({
        where: { id: summary.id },
        data: { totalSar: linesTotalSar },
      });
    }

    await recordSalesLedgerAudit({
      boutiqueId: scopeId,
      date,
      actorId: user.id,
      action: 'IMPORT_APPLY',
      metadata: { monthlyMatrixImport: true, linesCount: dayQueue.length },
    });

    await syncDailyLedgerToSalesEntry({
      boutiqueId: scopeId,
      date,
      actorUserId: user.id,
    });
  }

  return NextResponse.json({
    success: true,
    dryRun: false,
    month,
    includePreviousMonth,
    sheetName,
    headerRowIndex: 1,
    employeeStartCol: EMPLOYEE_START_COL,
    employeeEndCol,
    mappedEmployees,
    unmappedEmployees,
    inserted,
    updated,
    skippedEmpty,
    applyAllowed: true,
    applyBlockReasons: [],
    blockingErrorsCount: 0,
    blockingErrors: [],
    sampleNonBlankCells: sampleNonBlankCells.slice(0, 12),
    diagnostic: {
      headerCellCount,
      employeeStartCol: EMPLOYEE_START_COL + 1,
      employeeEndCol: employeeEndCol + 1,
      totalRows: rowCount,
      totalCols: headerCellCount,
      recordsParsed: queue.length,
      firstRowWithDataSample,
    },
  });
}
