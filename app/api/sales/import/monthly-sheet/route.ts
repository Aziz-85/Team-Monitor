/**
 * POST /api/sales/import/monthly-sheet
 * Monthly Sheet Import — reads from month-named sheets (JAN–DEC).
 * Multipart: file, month (YYYY-MM), includePrevious ("1"|"0"), dryRun ("1"|"0", default "1").
 * If includePrevious: import selected month + previous month.
 * Do NOT read "Data" sheet. UPSERT only, never delete.
 * RBAC: ADMIN, MANAGER. Boutique scope required.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import {
  parseOneMonthlySheet,
  sheetNameFromMonth,
  previousMonthKey,
  loadEmployeesMapWithIds,
  HEADER_SCAN_ROWS,
  type MonthlySheetRow,
  type HeaderCandidate,
} from '@/lib/sales/parseMonthlySheetExcel';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { normalizeMonthKey } from '@/lib/time';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER'] as const;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xlsm'];

/** Normalize for matching: trim, collapse space, lower, remove . - _, Arabic normalization. */
function norm(h: string): string {
  let s = String(h ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.\-_]/g, '');
  s = s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  s = s.replace(/[\u064B-\u065F\u0670]/g, '');
  return s;
}

const NAME_ALIASES: Record<string, string[]> = {
  hussain: ['husain', 'hussein', 'hussain', 'حسين'],
  alanoud: ['al anoud', 'alanoud', 'al-anoud', 'العنود', 'ال عنود'],
};

function normalizeForAlias(n: string): string {
  const noSpace = n.replace(/\s+/g, '');
  for (const [canon, aliases] of Object.entries(NAME_ALIASES)) {
    if (n === canon || noSpace === canon || aliases.includes(n) || aliases.includes(noSpace)) return canon;
  }
  return noSpace || n;
}

/** Resolve sheet header to empId + display name. Prefer workbook Employees_Map, then DB (full name, first name, no-space, alias). */
function resolveHeaderToEmployee(
  header: string,
  workbookMap: Map<string, string>,
  employees: { empId: string; name: string | null }[]
): { empId: string; employeeName: string } | null {
  const h = norm(header);
  if (!h) return null;
  const empIdFromWorkbook = workbookMap.get(h);
  if (empIdFromWorkbook) {
    const e = employees.find((x) => (x.empId ?? '').trim() === empIdFromWorkbook);
    if (e) return { empId: empIdFromWorkbook, employeeName: (e.name ?? '').trim() || empIdFromWorkbook };
  }
  const headerNoSpace = h.replace(/\s+/g, '');
  const headerAlias = normalizeForAlias(h);
  for (const e of employees) {
    const empId = (e.empId ?? '').trim();
    const name = (e.name ?? '').trim();
    if (!empId) continue;
    const n = norm(name);
    const first = n.split(/\s+/)[0] ?? '';
    const noSpace = n.replace(/\s+/g, '');
    const nameAlias = normalizeForAlias(n);
    if (n && h === n) return { empId, employeeName: name };
    if (first && h === first) return { empId, employeeName: name };
    if (noSpace && headerNoSpace === noSpace) return { empId, employeeName: name };
    if (n && n.includes(h)) return { empId, employeeName: name };
    if (nameAlias && headerAlias && nameAlias === headerAlias) return { empId, employeeName: name };
  }
  return null;
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
  const { boutiqueId } = scopeResult;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const monthParam = (formData.get('month') as string)?.trim() ?? '';
  const includePreviousRaw = (formData.get('includePrevious') as string)?.trim() ?? '0';
  const includePrevious = includePreviousRaw === '1';
  const dryRunRaw = (formData.get('dryRun') as string)?.trim() ?? '1';
  const dryRun = dryRunRaw !== '0';

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  const fileName = (file.name || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
    return NextResponse.json({ error: 'Only .xlsx or .xlsm files are allowed.' }, { status: 400 });
  }

  const selectedMonth = normalizeMonthKey(monthParam);
  const months: string[] = [selectedMonth];
  if (includePrevious) {
    const prev = previousMonthKey(selectedMonth);
    if (prev) months.push(prev);
  }
  const sheets = months.map((m) => sheetNameFromMonth(m)).filter(Boolean);
  if (sheets.length !== months.length) {
    return NextResponse.json({ error: 'Invalid month (use YYYY-MM)' }, { status: 400 });
  }

  const monthSet = new Set(months);
  const [monthStart, monthEnd] = (() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    if (includePrevious) {
      const prev = previousMonthKey(selectedMonth);
      if (prev) {
        const [py, pm] = prev.split('-').map(Number);
        const pStart = new Date(Date.UTC(py, pm - 1, 1));
        return [
          pStart < start ? pStart : start,
          end,
        ];
      }
    }
    return [start, end];
  })();

  const monthLocked = await prisma.boutiqueSalesSummary.findFirst({
    where: {
      boutiqueId,
      date: { gte: monthStart, lte: monthEnd },
      status: 'LOCKED',
    },
    select: { date: true },
  });

  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return NextResponse.json({ error: 'Invalid Excel file' }, { status: 400 });
  }

  const sheetErrors: string[] = [];
  const invalidRows: { sheet: string; row: number; col: string; reason: string }[] = [];
  const unmappedEmployees: { sheet: string; header: string }[] = [];
  const allRowsBySheet: {
    sheetName: string;
    rows: MonthlySheetRow[];
    employeeColumns: { header: string; colIndex: number }[];
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
  }[] = [];

  const headerNotFoundSheets: { sheetName: string; error: string; headerCandidates?: HeaderCandidate[] }[] = [];

  for (let i = 0; i < sheets.length; i++) {
    const sheetName = sheets[i];
    const monthKey = months[i];
    const parseResult = parseOneMonthlySheet(workbook, sheetName, monthKey);
    if (!parseResult.ok) {
      sheetErrors.push(parseResult.error);
      headerNotFoundSheets.push({
        sheetName,
        error: parseResult.error,
        headerCandidates: parseResult.headerCandidates,
      });
      continue;
    }
    for (const e of parseResult.errors) {
      invalidRows.push({ sheet: sheetName, row: e.row, col: e.colHeader, reason: e.reason });
    }
    allRowsBySheet.push({
      sheetName,
      rows: parseResult.rows,
      employeeColumns: parseResult.employeeColumns.map((c) => ({ header: c.header, colIndex: c.colIndex })),
      headerRowIndex: parseResult.headerRowIndex,
      employeeStartCol: parseResult.employeeStartCol,
      employeeEndCol: parseResult.employeeEndCol,
      matchedEmployeeHeaders: parseResult.matchedEmployeeHeaders,
      rawEmployeeHeaders: parseResult.rawEmployeeHeaders,
      nonBlankCellsCount: parseResult.nonBlankCellsCount,
      sampleNonBlankCells: parseResult.sampleNonBlankCells,
      blockingErrors: parseResult.blockingErrors,
      headerScanRows: parseResult.headerScanRows,
      headerCandidates: parseResult.headerCandidates,
    });
  }

  const employeesInBoutique = await prisma.employee.findMany({
    where: { boutiqueId },
    select: { empId: true, name: true },
  });
  const workbookEmployeeMap = loadEmployeesMapWithIds(workbook);
  const headerToEmpId = new Map<string, string>();
  const mappedHeadersBySheet: { sheet: string; col?: number; header: string; empId: string; employeeName: string }[] = [];
  const unmappedWarningsBySheet: { sheet: string; col?: number; header: string; normalized?: string }[] = [];

  for (const { sheetName, employeeColumns } of allRowsBySheet) {
    const seen = new Set<string>();
    for (const { header, colIndex } of employeeColumns) {
      const key = norm(header);
      if (seen.has(key)) continue;
      seen.add(key);
      const resolved = resolveHeaderToEmployee(header, workbookEmployeeMap, employeesInBoutique);
      if (resolved) {
        headerToEmpId.set(key, resolved.empId);
        mappedHeadersBySheet.push({
          sheet: sheetName,
          col: colIndex,
          header,
          empId: resolved.empId,
          employeeName: resolved.employeeName,
        });
      } else {
        unmappedEmployees.push({ sheet: sheetName, header });
        unmappedWarningsBySheet.push({ sheet: sheetName, col: colIndex, header, normalized: key });
      }
    }
  }

  const mappedEmployeeColumnsCount = headerToEmpId.size;
  const noColumnsMapped =
    allRowsBySheet.some((s) => s.employeeColumns.length > 0) && mappedEmployeeColumnsCount === 0;
  const noColumnsMappedError = noColumnsMapped
    ? 'No employee columns mapped; nothing to import. Check header detection/mapping.'
    : null;

  const totalNonBlankCells = allRowsBySheet.reduce((s, x) => s + (x.nonBlankCellsCount ?? 0), 0);
  const hasBlockingErrors = allRowsBySheet.some((s) => (s.blockingErrors?.length ?? 0) > 0);
  const allBlockingErrors = allRowsBySheet.flatMap((s) =>
    (s.blockingErrors ?? []).map((e) => ({ ...e, sheet: s.sheetName }))
  );
  const monthLockedError = monthLocked
    ? `Month is locked; cannot apply import. Unlock the affected date(s) first.`
    : null;

  const queue: { date: Date; dateKey: string; empId: string; amountSar: number }[] = [];
  const skippedByDateKey = new Map<string, number>();
  const affectedDates: string[] = [];

  for (const { rows } of allRowsBySheet) {
    for (const row of rows) {
      const rowMonth = row.dateKey.slice(0, 7);
      if (!monthSet.has(rowMonth)) continue;
      affectedDates.push(row.dateKey);
      skippedByDateKey.set(row.dateKey, row.skippedEmptyCount);
      for (const v of row.values) {
        const empId = headerToEmpId.get(norm(v.columnHeader));
        if (!empId) continue;
        if (v.amountSar === 0) continue;
        queue.push({
          date: row.date,
          dateKey: row.dateKey,
          empId,
          amountSar: v.amountSar,
        });
      }
    }
  }

  const uniqueDates = Array.from(new Set(affectedDates)).sort();
  let skippedEmpty = 0;
  for (const { rows } of allRowsBySheet) {
    for (const row of rows) {
      if (monthSet.has(row.dateKey.slice(0, 7))) skippedEmpty += row.skippedEmptyCount;
    }
  }

  const canApply =
    sheetErrors.length === 0 &&
    invalidRows.length === 0 &&
    !noColumnsMapped &&
    totalNonBlankCells > 0 &&
    !hasBlockingErrors &&
    !monthLocked;

  const headerNotFoundBlocking =
    headerNotFoundSheets.length > 0 ? ['HEADER_NOT_FOUND'] : [];

  const diagnostic = [
    ...allRowsBySheet.map((s) => {
      const mapped = mappedHeadersBySheet
        .filter((m) => m.sheet === s.sheetName)
        .map((m) => ({ col: m.col, headerRaw: m.header, userId: m.empId, userName: m.employeeName }));
      const unmapped = unmappedWarningsBySheet
        .filter((u) => u.sheet === s.sheetName)
        .map((u) => ({ col: u.col, headerRaw: u.header, normalized: u.normalized ?? norm(u.header) }));
      return {
        sheetName: s.sheetName,
        headerScanRows: s.headerScanRows ?? HEADER_SCAN_ROWS,
        detectedHeaderRow: s.headerRowIndex,
        headerCandidates: s.headerCandidates,
        headerRowIndex: s.headerRowIndex,
        employeeStartCol: s.employeeStartCol,
        employeeEndCol: s.employeeEndCol,
        rawEmployeeHeaders: s.rawEmployeeHeaders ?? [],
        mappedCount: mapped.length,
        mapped,
        unmapped,
        nonBlankCellsCount: s.nonBlankCellsCount ?? 0,
        sampleNonBlankCells: s.sampleNonBlankCells ?? [],
        blockingErrors: s.blockingErrors ?? [],
      };
    }),
    ...headerNotFoundSheets.map((f) => ({
      sheetName: f.sheetName,
      headerScanRows: HEADER_SCAN_ROWS,
      detectedHeaderRow: null as number | null,
      headerCandidates: f.headerCandidates,
      blockingErrors: ['HEADER_NOT_FOUND'] as string[],
    })),
  ];

  if (dryRun) {
    const perDateSummary = uniqueDates.map((dateKey) => {
      const dayQueue = queue.filter((q) => q.dateKey === dateKey);
      return {
        date: dateKey,
        linesTotalSar: dayQueue.reduce((s, q) => s + q.amountSar, 0),
        insertedLinesCount: 0,
        updatedLinesCount: 0,
        skippedEmptyCount: skippedByDateKey.get(dateKey) ?? 0,
      };
    });
    return NextResponse.json({
      success: true,
      dryRun: true,
      result: {
        mode: 'dry_run',
        months,
        sheets,
        daysAffected: uniqueDates,
        inserted: 0,
        updated: 0,
        skippedEmpty,
        invalidRows,
        unmappedEmployees,
        mappedHeaders: mappedHeadersBySheet,
        unmappedWarnings: unmappedWarningsBySheet,
        perDateSummary,
      },
      diagnostic: diagnostic.length > 0 ? diagnostic : undefined,
      mode: 'dry_run',
      months,
      sheets,
      daysAffected: uniqueDates,
      inserted: 0,
      updated: 0,
      skippedEmpty,
      invalidRows,
      unmappedEmployees,
      mappedHeaders: mappedHeadersBySheet,
      unmappedWarnings: unmappedWarningsBySheet,
      perDateSummary,
      ...(sheetErrors.length > 0 && { sheetErrors }),
      ...(noColumnsMappedError && { noColumnsMappedError }),
      ...(monthLockedError && { monthLockedError }),
      ...((hasBlockingErrors || headerNotFoundBlocking.length > 0) && {
        blockingErrors: [
          ...headerNotFoundBlocking,
          ...allBlockingErrors,
        ],
      }),
      canApply,
    });
  }

  if (!canApply) {
    return NextResponse.json(
      {
        error:
          monthLockedError ??
          noColumnsMappedError ??
          (hasBlockingErrors ? 'Apply blocked: decimal/negative/invalid values in import.' : null) ??
          (totalNonBlankCells === 0 ? 'No non-blank cells in employee range; check parsing.' : null) ??
          'Apply blocked due to sheet or validation errors.',
        diagnostic: diagnostic.length > 0 ? diagnostic : undefined,
        sheetErrors: sheetErrors.length > 0 ? sheetErrors : undefined,
        invalidRows: invalidRows.length > 0 ? invalidRows : undefined,
        monthLockedError: monthLockedError ?? undefined,
        blockingErrors: hasBlockingErrors ? allBlockingErrors : undefined,
      },
      { status: 400 }
    );
  }

  let inserted = 0;
  let updated = 0;
  const perDateSummary: {
    date: string;
    linesTotalSar: number;
    insertedLinesCount: number;
    updatedLinesCount: number;
    skippedEmptyCount: number;
  }[] = [];

  for (const dateKey of uniqueDates) {
    const dayQueue = queue.filter((q) => q.dateKey === dateKey);
    if (dayQueue.length === 0) continue;

    const date = dayQueue[0].date;

    let summary = await prisma.boutiqueSalesSummary.findUnique({
      where: { boutiqueId_date: { boutiqueId, date } },
      include: { lines: true },
    });

    if (!summary) {
      summary = await prisma.boutiqueSalesSummary.create({
        data: {
          boutiqueId,
          date,
          totalSar: 0,
          status: 'DRAFT',
          enteredById: user.id,
        },
        include: { lines: true },
      });
      await recordSalesLedgerAudit({
        boutiqueId,
        date,
        actorId: user.id,
        action: 'SUMMARY_CREATE',
        metadata: { monthlySheetImport: true, months, totalSar: 0 },
      });
    }

    const existingByEmp = new Map(summary.lines.map((l) => [l.employeeId, l]));
    let dayInserted = 0;
    let dayUpdated = 0;

    if (summary.status === 'LOCKED') {
      await prisma.boutiqueSalesSummary.update({
        where: { id: summary.id },
        data: { status: 'DRAFT', lockedById: null, lockedAt: null },
      });
      await recordSalesLedgerAudit({
        boutiqueId,
        date,
        actorId: user.id,
        action: 'POST_LOCK_EDIT',
        reason: 'Monthly sheet import; auto-unlock',
        metadata: { monthlySheetImport: true },
      });
    }

    for (const item of dayQueue) {
      const existed = existingByEmp.has(item.empId);
      await prisma.boutiqueSalesLine.upsert({
        where: {
          summaryId_employeeId: { summaryId: summary.id, employeeId: item.empId },
        },
        create: {
          summaryId: summary.id,
          employeeId: item.empId,
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
        dayUpdated += 1;
        updated += 1;
      } else {
        dayInserted += 1;
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

    perDateSummary.push({
      date: dateKey,
      linesTotalSar,
      insertedLinesCount: dayInserted,
      updatedLinesCount: dayUpdated,
      skippedEmptyCount: skippedByDateKey.get(dateKey) ?? 0,
    });

    await recordSalesLedgerAudit({
      boutiqueId,
      date,
      actorId: user.id,
      action: 'IMPORT_APPLY',
      metadata: { monthlySheetImport: true, months, linesCount: dayQueue.length },
    });

    await syncDailyLedgerToSalesEntry({
      boutiqueId,
      date,
      actorUserId: user.id,
    });
  }

  return NextResponse.json({
    success: true,
    dryRun: false,
    result: {
      mode: 'apply',
      months,
      sheets,
      daysAffected: uniqueDates,
      inserted,
      updated,
      skippedEmpty,
      invalidRows: [],
      unmappedEmployees,
      perDateSummary,
    },
    diagnostic: diagnostic.length > 0 ? diagnostic : undefined,
    mode: 'apply',
    months,
    sheets,
    daysAffected: uniqueDates,
    inserted,
    updated,
    skippedEmpty,
    unmappedEmployees,
    perDateSummary,
    canApply: true,
  });
}
