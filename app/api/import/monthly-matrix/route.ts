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
import { normalizeMonthKey, getMonthRangeDayKeys } from '@/lib/time';
import { dateKeyUTC, monthDaysUTC } from '@/lib/dates/safeCalendar';
import { parseExcelDateToDateKey } from '@/lib/sales/excelDateKey';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;

const SHEET_NAME = 'DATA_MATRIX';
const SCOPE_COL = 0;          // A (0-based)
const DATE_COL = 1;           // B (0-based)
const EMPLOYEE_START_COL = 3; // D (0-based)
const EMPLOYEE_END_COL_FALLBACK = 11; // L (0-based), template D..L

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

function isDateCell(v: unknown): boolean {
  return parseExcelDateToDateKey(unwrapCell(v)) != null;
}

/** Parse employee cell to number; 0 if not numeric. Do not read TOTAL column. */
function parseNumberCell(v: unknown): number {
  const raw = unwrapCell(v);
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  const s = String(raw ?? '').trim().replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function isHeaderRow(row: unknown[]): boolean {
  const a = String(unwrapCell(row?.[0]) ?? '').toLowerCase();
  const b = String(unwrapCell(row?.[1]) ?? '').toLowerCase();
  return a.includes('scopeid') && b.includes('date');
}

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

  const boutique = await prisma.boutique.findUnique({
    where: { id: scopeId },
    select: { id: true, code: true },
  });
  if (!boutique) {
    return NextResponse.json({ success: false, error: 'Boutique not found', applyAllowed: false }, { status: 404 });
  }
  const acceptedScopeValues = new Set(
    [boutique.id, boutique.code].filter(Boolean).map((s) => String(s).trim().toUpperCase())
  );

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
    header: 1,
    defval: null,
    blankrows: false,
  }) as unknown[][];

  const prev = includePreviousMonth ? previousMonthKey(month) : null;

  // Header row only for column labels (no start-row logic)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    if (isHeaderRow((aoa[i] ?? []) as unknown[])) {
      headerRowIndex = i;
      break;
    }
  }
  const header = (headerRowIndex >= 0 ? (aoa[headerRowIndex] ?? []) : []).map((x) => String(unwrapCell(x) ?? '').trim());

  let employeeEndCol = EMPLOYEE_START_COL;
  for (let c = EMPLOYEE_START_COL; c < header.length; c++) {
    if (isStopHeader0(header[c])) {
      employeeEndCol = c - 1;
      break;
    }
    employeeEndCol = c;
  }
  if (employeeEndCol < EMPLOYEE_START_COL) {
    employeeEndCol = EMPLOYEE_END_COL_FALLBACK;
  }

  const employeeColumns: { colIndex: number; headerRaw: string }[] = [];
  for (let c = EMPLOYEE_START_COL; c <= employeeEndCol; c++) {
    const headerRaw = header[c] ?? '';
    employeeColumns.push({ colIndex: c, headerRaw: headerRaw || `Col${c + 1}` });
  }

  // Scan ALL rows by dateKey only; no dataStartRow/header offset
  const rowsByDateKey = new Map<string, { row: unknown[]; date: Date; score: number }>();
  for (let r = 0; r < aoa.length; r++) {
    const rowArr = (aoa[r] ?? []) as unknown[];
    const dateRaw = unwrapCell(rowArr[DATE_COL]);
    if (!isDateCell(dateRaw)) continue;
    const dateKey = parseExcelDateToDateKey(dateRaw);
    if (!dateKey) continue;
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const inMonth = dateKey.startsWith(month + '-');
    const inPrev = !!prev && dateKey.startsWith(prev + '-');
    if (!inMonth && !inPrev) continue;
    let score = 0;
    for (let c = EMPLOYEE_START_COL; c <= employeeEndCol; c++) {
      score += parseNumberCell(rowArr[c]);
    }
    const existing = rowsByDateKey.get(dateKey);
    if (!existing || score > existing.score) {
      rowsByDateKey.set(dateKey, { row: rowArr, date, score });
    }
  }

  if (rowsByDateKey.size === 0) {
    return NextResponse.json({
      success: false,
      error: 'No rows found for the requested month in DATA_MATRIX',
      applyAllowed: false,
      applyBlockReasons: ['NO_ROWS_FOR_MONTH'],
    }, { status: 400 });
  }

  const firstDayKey = `${month}-01`;
  if (!rowsByDateKey.has(firstDayKey)) {
    return NextResponse.json({
      success: false,
      error: `Expected ${firstDayKey} row missing; do not import.`,
      applyAllowed: false,
      applyBlockReasons: ['IMPORT_ROW_START_MISMATCH'],
    }, { status: 400 });
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const dayKey of [firstDayKey, `${month}-02`, `${month}-03`]) {
      const entry = rowsByDateKey.get(dayKey);
      let computedTotal = 0;
      if (entry) {
        for (let c = EMPLOYEE_START_COL; c <= employeeEndCol; c++) {
          computedTotal += parseNumberCell(entry.row[c]);
        }
      }
      console.log('[IMPORT CHECK]', month, dayKey, 'rowFound', !!entry, 'rowTotal', computedTotal);
    }
  }

  const dayKeysOrdered = [...monthDaysUTC(month)];
  if (prev) {
    dayKeysOrdered.unshift(...monthDaysUTC(prev));
  }

  const blockingErrors: BlockingError[] = [];
  const sampleNonBlankCells: { row: number; col: number; headerRaw: string; value: unknown }[] = [];
  const SAMPLE_MAX = 12;
  const rows: { dateKey: string; date: Date; scopeId: string; values: { colIndex: number; headerRaw: string; amountSar: number }[]; skippedEmpty: number }[] = [];
  let lastNonEmptyScopeIdSeen = '';

  for (const dayKey of dayKeysOrdered) {
    const entry = rowsByDateKey.get(dayKey);
    if (!entry) continue;
    const rowArr = entry.row;
    const dateKey = dayKey;
    const date = entry.date;
    const rawScope = String(unwrapCell(rowArr[SCOPE_COL]) ?? '').trim();
    if (rawScope) lastNonEmptyScopeIdSeen = rawScope;
    const scopeId = rawScope || lastNonEmptyScopeIdSeen || '';
    const values: { colIndex: number; headerRaw: string; amountSar: number }[] = [];
    let skippedEmpty = 0;
    for (const { colIndex, headerRaw } of employeeColumns) {
      const amt = parseNumberCell(rowArr[colIndex]);
      if (amt > 0) {
        values.push({ colIndex, headerRaw, amountSar: amt });
        if (sampleNonBlankCells.length < SAMPLE_MAX) {
          sampleNonBlankCells.push({ row: 0, col: colIndex + 1, headerRaw, value: rowArr[colIndex] });
        }
      } else {
        skippedEmpty++;
      }
    }
    rows.push({ dateKey, date, scopeId, values, skippedEmpty });
  }

  const firstRowWithDataSample: { r: number; c: number; header: string; v: string }[] = [];
  for (const dk of [firstDayKey, `${month}-02`, `${month}-03`]) {
    const entry = rowsByDateKey.get(dk);
    if (!entry) continue;
    for (let c = EMPLOYEE_START_COL; c <= Math.min(EMPLOYEE_START_COL + 2, employeeEndCol); c++) {
      const v = parseNumberCell(entry.row[c]);
      if (v > 0 && firstRowWithDataSample.length < 8) {
        firstRowWithDataSample.push({ r: 0, c: c + 1, header: header[c] ?? '', v: String(v) });
      }
    }
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
  const { keys: mainKeys } = getMonthRangeDayKeys(month);
  mainKeys.forEach((k) => allowedDateSet.add(k));
  if (includePreviousMonth) {
    const prev = previousMonthKey(month);
    if (prev) {
      const { keys: prevKeys } = getMonthRangeDayKeys(prev);
      prevKeys.forEach((k) => allowedDateSet.add(k));
    }
  }

  const queue: { dateKey: string; date: Date; employeeId: string; amountSar: number }[] = [];
  let skippedEmpty = 0;

  for (const row of rows) {
    const rowScopeNorm = String(row.scopeId ?? '').trim().toUpperCase();
    if (!rowScopeNorm || !acceptedScopeValues.has(rowScopeNorm)) continue; // scopeId fill-down applied in rows
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
    const summaryByDate = new Map(existing.map((s) => [dateKeyUTC(s.date), s]));
    if (process.env.NODE_ENV !== 'production' && existing.length > 0) {
      const dates = existing.map((s) => s.date);
      const minD = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxD = new Date(Math.max(...dates.map((d) => d.getTime())));
      console.log('[MonthlyMatrix import dry-run] existing dateKeyUTC min/max', dateKeyUTC(minD), dateKeyUTC(maxD));
    }
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
      headerRowIndex: headerRowIndex >= 0 ? headerRowIndex + 1 : 0,
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
      sourceOverride: 'MONTHLY_MATRIX_TRACE_V9',
    });
  }

  return NextResponse.json({
    success: true,
    dryRun: false,
    month,
    includePreviousMonth,
    sheetName,
    headerRowIndex: headerRowIndex >= 0 ? headerRowIndex + 1 : 0,
    employeeStartCol: EMPLOYEE_START_COL + 1,
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
