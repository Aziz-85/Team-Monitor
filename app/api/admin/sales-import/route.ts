/**
 * Admin Excel → **SalesEntry** (canonical). BoutiqueSalesLine / batches are not used here.
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logSalesTargetAudit } from '@/lib/sales-target-audit';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { buildMsrTemplateImportPlan } from '@/lib/sales/adminMsrTemplateSalesImport';
import { salesEntryImportStableKey } from '@/lib/sales/salesEntryImportStableKey';
import { dateKeyUTC, parseExcelDateToYMD, ymdToUTCNoon } from '@/lib/dates/safeCalendar';
import { MSR_V2_CANONICAL_EMPLOYEES, detectMsrDataSheetLayout } from '@/lib/sales/msrTemplateParse';
import * as XLSX from 'xlsx';

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

/** Parse Excel date cell to dateKey (YYYY-MM-DD) using safeCalendar; no toISOString slice. */
function rawToDateKey(raw: unknown): string | null {
  const v = unwrapCell(raw);
  try {
    const ymd = parseExcelDateToYMD(v);
    const date = ymdToUTCNoon(ymd);
    return dateKeyUTC(date);
  } catch {
    return null;
  }
}

function rawToDate(raw: unknown): Date | null {
  const v = unwrapCell(raw);
  try {
    const ymd = parseExcelDateToYMD(v);
    return ymdToUTCNoon(ymd);
  } catch {
    return null;
  }
}

const ADMIN_ROLES = ['MANAGER', 'ADMIN'] as const;
const MAX_ROWS_SIMPLE = 10000;
const MAX_ROWS_MSR = 5000;
const MAX_COLS_MSR = 300;
const TOLERANCE_SAR = 1;

const ALLOWED_EXTENSIONS = /\.(xlsx|xlsm|xls)$/i;
const FALLBACK_BOUTIQUE_ID = 'bout_dhhrn_001';

async function getDefaultBoutiqueId(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'DEFAULT_BOUTIQUE_ID' },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return FALLBACK_BOUTIQUE_ID;
  try {
    const id = JSON.parse(row.valueJson) as string;
    return typeof id === 'string' ? id : FALLBACK_BOUTIQUE_ID;
  } catch {
    return FALLBACK_BOUTIQUE_ID;
  }
}

/** Map userId -> boutiqueId from Employee; fallback to default. */
async function getUserIdToBoutiqueId(userIds: string[]): Promise<Map<string, string>> {
  const defaultId = await getDefaultBoutiqueId();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, empId: true },
  });
  const empIds = users.map((u) => u.empId).filter(Boolean);
  const employees = await prisma.employee.findMany({
    where: { empId: { in: empIds } },
    select: { empId: true, boutiqueId: true },
  });
  const empToBoutique = new Map(employees.map((e) => [e.empId, e.boutiqueId]));
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.id, u.empId ? (empToBoutique.get(u.empId) ?? defaultId) : defaultId);
  }
  return map;
}

type SkippedItem = { rowNumber: number; empId?: string; columnHeader?: string; reason: string };
type WarningItem = { rowNumber: number; date?: string; message?: string; totalAfter?: number; sumEmployees?: number; delta?: number };

type ImportSummaryPayload = {
  totalRowsRead: number;
  validRowsProcessed: number;
  rowsGenerated: number;
  newCount: number;
  updatedCount: number;
  identicalCount: number;
  lockedCount: number;
  errorCount: number;
  skippedEmptyRows: number;
  skippedSummaryRows: number;
  skippedNoNumericRows: number;
  skippedMonthFilteredRows: number;
  invalidDateRows: number;
  invalidSalesValues: number;
  totalSales: number;
  totalMismatchRowCount: number;
  dailyBreakdown: Array<{ dateKey: string; totalSar: number }>;
};

type EmployeeSummaryPayload = {
  ranked: Array<{
    rank: number;
    employee: string;
    userId: string;
    totalSales: number;
    contributionPct: number;
  }>;
  perEmployeePerDay: Array<{ dateKey: string; employee: string; userId: string; sales: number }>;
};

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  const fileName = (file.name || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.test(fileName)) {
    return NextResponse.json(
      { error: 'File must be .xlsx, .xlsm, or .xls' },
      { status: 400 }
    );
  }
  const importMode = ((formData.get('importMode') as string)?.toLowerCase() || 'auto').trim();
  const monthParam = (formData.get('month') as string)?.trim() || '';
  const dryRun =
    formData.get('dryRun') === '1' ||
    formData.get('dryRun') === 'true' ||
    String(formData.get('dryRun') ?? '').toLowerCase() === 'yes';
  const confirmed =
    formData.get('confirmed') === '1' ||
    formData.get('confirmed') === 'true' ||
    String(formData.get('confirmed') ?? '').toLowerCase() === 'yes';
  const clientSha = String(formData.get('fileSha256') ?? '').trim();

  const buf = Buffer.from(await file.arrayBuffer());
  const fileSha256 = createHash('sha256').update(buf).digest('hex');
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid Excel file or unsupported format' }, { status: 400 });
  }

  const dataSheetName = workbook.SheetNames.find((n) => n.toLowerCase() === 'data');
  const msrOrTemplateExplicit = importMode === 'msr' || importMode === 'msr-template';
  if (msrOrTemplateExplicit && !dataSheetName) {
    return NextResponse.json(
      { error: "Sheet 'Data' not found. The file must contain a sheet named Data (case-insensitive)." },
      { status: 400 }
    );
  }
  const sheet = dataSheetName
    ? workbook.Sheets[dataSheetName]
    : workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return NextResponse.json({ error: 'No sheet found' }, { status: 400 });

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  }) as unknown[][];

  const tryMsrLayout =
    importMode === 'msr' ||
    importMode === 'msr-template' ||
    (!!dataSheetName && importMode !== 'simple');
  const msrLayout = tryMsrLayout ? detectMsrDataSheetLayout(rows) : null;

  if (msrOrTemplateExplicit && !msrLayout) {
    return NextResponse.json(
      {
        error: `Could not detect MSR layout. For the V2 template the Data sheet header must include Date and all of: ${MSR_V2_CANONICAL_EMPLOYEES.join(', ')}. Legacy layout: Date, Total Sale After, then empId columns.`,
      },
      { status: 400 }
    );
  }
  if (importMode === 'msr-template' && msrLayout?.kind !== 'template_columns') {
    return NextResponse.json(
      {
        error:
          "importMode msr-template requires the column-employee MSR layout (employee names as headers next to Date). This file matches the legacy Total Sale After + empId layout — use importMode msr instead.",
      },
      { status: 400 }
    );
  }

  const useMsrMode =
    importMode === 'msr' ||
    importMode === 'msr-template' ||
    (!!dataSheetName && importMode !== 'simple' && !!msrLayout);

  let headerRow: string[] = [];
  let headerIndex = 0;
  let useMsrLegacy = false;
  let useMsrTemplate = false;
  if (rows.length >= 1) {
    if (useMsrMode && msrLayout) {
      headerRow = msrLayout.header;
      headerIndex = msrLayout.headerIndex;
      useMsrLegacy = msrLayout.kind === 'legacy_msr';
      useMsrTemplate = msrLayout.kind === 'template_columns';
    } else {
      headerRow = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
    }
  }

  if (useMsrMode && (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam))) {
    return NextResponse.json(
      { error: 'MSR import requires month (YYYY-MM) for date year inference' },
      { status: 400 }
    );
  }

  if (rows.length < 2) {
    return NextResponse.json({
      importedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      skippedRowCount: 0,
      unchangedCount: 0,
      skipped: [],
      warnings: [],
      ignoredColumns: [],
      fileSha256,
      dryRun: dryRun || undefined,
    });
  }

  if (!dryRun) {
    if (!confirmed) {
      return NextResponse.json(
        {
          error:
            'Confirmation required: POST with dryRun=1 first, then repeat with confirmed=1 and the same file bytes.',
          code: 'CONFIRMATION_REQUIRED',
          fileSha256,
        },
        { status: 409 }
      );
    }
    if (clientSha && clientSha !== fileSha256) {
      return NextResponse.json(
        {
          error: 'fileSha256 mismatch. Use the hash from the dry-run response with the identical file.',
          expected: fileSha256,
          got: clientSha,
        },
        { status: 400 }
      );
    }
  }

  const skipped: SkippedItem[] = [];
  const warnings: WarningItem[] = [];
  const ignoredColumnsSet = new Set<string>();
  let importedCount = 0;
  let updatedCount = 0;
  let skippedRowsCount = 0;
  let unchangedCount = 0;
  let importSummary: ImportSummaryPayload | undefined;
  let employeeSummary: EmployeeSummaryPayload | undefined;
  let importBatchId: string | undefined;

  if (!useMsrMode) {
    const dateCol = headerRow.findIndex((h) => h.toLowerCase() === 'date');
    const emailCol = headerRow.findIndex((h) => h.toLowerCase() === 'email');
    const amountCol = headerRow.findIndex((h) => h.toLowerCase() === 'amount');
    if (dateCol < 0 || emailCol < 0 || amountCol < 0) {
      return NextResponse.json(
        { error: 'Simple import requires columns: date, email, amount' },
        { status: 400 }
      );
    }
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        fileSha256,
        importMode: 'simple',
        message: 'Simple import columns validated. Re-submit with confirmed=1 and the same file to write.',
        skipped: [],
        warnings: [],
        ignoredColumns: [],
      });
    }
    const emailToUser = await prisma.user.findMany({
      where: { disabled: false, employee: { email: { not: null } } },
      include: { employee: { select: { email: true } } },
    });
    const emailMap = new Map<string, string>();
    for (const u of emailToUser) {
      const email = u.employee?.email?.trim()?.toLowerCase();
      if (email) emailMap.set(email, u.id);
    }
    const defaultBoutiqueId = await getDefaultBoutiqueId();
    const userIdsSimple = Array.from(new Set(emailMap.values()));
    const userIdToBoutique = await getUserIdToBoutiqueId(userIdsSimple);
    const limit = Math.min(rows.length - 1, MAX_ROWS_SIMPLE);
    for (let i = 1; i <= limit; i++) {
      const row = rows[i] as unknown[];
      const dateRaw = row[dateCol];
      const dateKey = rawToDateKey(dateRaw);
      const dateNorm = rawToDate(dateRaw);
      const email = String(row[emailCol] ?? '').trim().toLowerCase();
      let amount: number;
      const amountRaw = row[amountCol];
      if (typeof amountRaw === 'number' && Number.isFinite(amountRaw)) {
        amount = Math.round(amountRaw);
      } else {
        amount = Math.round(Number(amountRaw));
      }
      if (!dateKey || !dateNorm) {
        skipped.push({ rowNumber: i + 1, reason: 'Invalid date' });
        continue;
      }
      if (amount < 0 || !Number.isFinite(amount)) {
        skipped.push({ rowNumber: i + 1, reason: 'Invalid amount' });
        continue;
      }
      const userId = emailMap.get(email);
      if (!userId) {
        skipped.push({ rowNumber: i + 1, reason: 'User not found' });
        continue;
      }
      const boutiqueId = userIdToBoutique.get(userId) ?? defaultBoutiqueId;
      try {
        const res = await upsertCanonicalSalesEntry({
          kind: 'direct',
          boutiqueId,
          userId,
          amount,
          source: SALES_ENTRY_SOURCE.EXCEL_IMPORT,
          actorUserId: user.id,
          date: dateNorm,
        });
        if (res.status === 'rejected_locked') {
          skipped.push({ rowNumber: i + 1, reason: 'Day locked in daily sales ledger' });
          continue;
        }
        if (res.status === 'rejected_precedence') {
          skipped.push({
            rowNumber: i + 1,
            reason: `Source precedence: existing "${res.existingSource ?? ''}" outranks EXCEL_IMPORT`,
          });
          continue;
        }
        if (res.status === 'rejected_invalid') {
          skipped.push({ rowNumber: i + 1, reason: res.reason });
          continue;
        }
        if (res.status === 'created') importedCount += 1;
        else if (res.status === 'updated') updatedCount += 1;
        else if (res.status === 'no_change') unchangedCount += 1;
      } catch {
        skipped.push({ rowNumber: i + 1, reason: 'Upsert failed' });
      }
    }
    if (rows.length - 1 > MAX_ROWS_SIMPLE) {
      skipped.push({
        rowNumber: MAX_ROWS_SIMPLE + 2,
        reason: `Row limit (${MAX_ROWS_SIMPLE}) exceeded`,
      });
    }
  } else if (useMsrLegacy) {
    const header = headerRow;
    const dateCol = header.findIndex((h) => h.toLowerCase().includes('date'));
    const totalSaleAfterCol = header.findIndex((h) =>
      h.toLowerCase().includes('total sale after')
    );
    if (dateCol < 0 || totalSaleAfterCol < 0) {
      return NextResponse.json(
        { error: 'Legacy MSR sheet must have Date and Total Sale After columns' },
        { status: 400 }
      );
    }

    const allUsers = await prisma.user.findMany({
      select: { id: true, empId: true },
    });
    const empIdToUserId = new Map<string, string>();
    const validEmpIds = new Set<string>();
    for (const u of allUsers) {
      const eid = String(u.empId).trim();
      empIdToUserId.set(eid, u.id);
      validEmpIds.add(eid);
    }
    const employeeCols: { col: number; empId: string; userId: string }[] = [];
    const colCount = Math.min(header.length, MAX_COLS_MSR);
    for (let c = totalSaleAfterCol + 1; c < colCount; c++) {
      const label = String(header[c] ?? '').trim();
      if (!label) continue;
      if (validEmpIds.has(label)) {
        const uid = empIdToUserId.get(label)!;
        employeeCols.push({ col: c, empId: label, userId: uid });
      } else {
        ignoredColumnsSet.add(label);
      }
    }

    const msrUserIds = Array.from(new Set(employeeCols.map((e) => e.userId)));
    const userIdToBoutiqueMsr =
      msrUserIds.length > 0 ? await getUserIdToBoutiqueId(msrUserIds) : new Map<string, string>();
    const defaultBoutiqueIdMsr = await getDefaultBoutiqueId();

    const dataStart = headerIndex + 1;
    const rowLimit = Math.min(rows.length - 1, dataStart + MAX_ROWS_MSR - 1);

    const dateKeysInRequestedMonth = new Set<string>();
    for (let i = dataStart; i <= rowLimit; i++) {
      const row = rows[i] as unknown[];
      const dk = rawToDateKey(row[dateCol]);
      if (dk && monthParam && dk.startsWith(monthParam + '-')) {
        dateKeysInRequestedMonth.add(dk);
      }
    }
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam) && !dateKeysInRequestedMonth.has(monthParam + '-01')) {
      return NextResponse.json(
        {
          error: `Expected row for ${monthParam}-01 missing in sheet. Do not import.`,
          importedCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          skippedRowCount: 0,
          unchangedCount: 0,
          skipped: [],
          warnings: [],
        },
        { status: 400 }
      );
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        fileSha256,
        importMode: 'msr',
        message: 'MSR (legacy) layout validated. Re-submit with confirmed=1 and the same file to write.',
        skipped: [],
        warnings: [],
        ignoredColumns: [],
      });
    }

    for (let i = dataStart; i <= rowLimit; i++) {
      const row = rows[i] as unknown[];
      const dateRaw = row[dateCol];
      const dateKey = rawToDateKey(dateRaw);
      const dateNorm = rawToDate(dateRaw);
      if (!dateKey || !dateNorm) {
        skippedRowsCount += 1;
        warnings.push({
          rowNumber: i + 1,
          date: String(unwrapCell(dateRaw) ?? '').slice(0, 30),
          message: 'Invalid date; row skipped',
        });
        continue;
      }
      let totalSaleAfter = 0;
      const totalRaw = row[totalSaleAfterCol];
      if (typeof totalRaw === 'number' && Number.isFinite(totalRaw)) {
        totalSaleAfter = Math.round(totalRaw);
      } else {
        totalSaleAfter = Math.round(Number(totalRaw));
      }
      let sumEmployees = 0;
      for (const { col, userId } of employeeCols) {
        const raw = row[col];
        if (raw === '-' || raw === '' || raw == null) continue;
        let amount: number;
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          amount = Math.round(raw);
        } else {
          amount = Math.round(Number(raw));
        }
        if (amount <= 0 || !Number.isFinite(amount)) continue;
        sumEmployees += amount;
        const boutiqueId = userIdToBoutiqueMsr.get(userId) ?? defaultBoutiqueIdMsr;
        try {
          const res = await upsertCanonicalSalesEntry({
            kind: 'direct',
            boutiqueId,
            userId,
            amount,
            source: SALES_ENTRY_SOURCE.EXCEL_IMPORT,
            actorUserId: user.id,
            date: dateNorm,
          });
          if (res.status === 'rejected_locked') {
            skipped.push({ rowNumber: i + 1, reason: 'Day locked in daily sales ledger' });
            continue;
          }
          if (res.status === 'rejected_precedence') {
            skipped.push({
              rowNumber: i + 1,
              reason: `Source precedence: existing "${res.existingSource ?? ''}" outranks EXCEL_IMPORT`,
            });
            continue;
          }
          if (res.status === 'rejected_invalid') {
            skipped.push({ rowNumber: i + 1, reason: res.reason });
            continue;
          }
          if (res.status === 'created') importedCount += 1;
          else if (res.status === 'updated') updatedCount += 1;
          else if (res.status === 'no_change') unchangedCount += 1;
        } catch {
          skipped.push({ rowNumber: i + 1, reason: 'Upsert failed' });
        }
      }
      if (
        Number.isFinite(totalSaleAfter) &&
        Math.abs(sumEmployees - totalSaleAfter) > TOLERANCE_SAR
      ) {
        warnings.push({
          rowNumber: i + 1,
          date: dateKey,
          message: `Total mismatch: sum employees ${sumEmployees} vs Total Sale After ${totalSaleAfter} (delta ${sumEmployees - totalSaleAfter})`,
          totalAfter: totalSaleAfter,
          sumEmployees,
          delta: sumEmployees - totalSaleAfter,
        });
      }
    }
  } else if (useMsrTemplate) {
    let templatePlan;
    try {
      templatePlan = await buildMsrTemplateImportPlan({
        rows,
        headerRow,
        headerIndex,
        monthParam,
        maxDataRows: MAX_ROWS_MSR,
        getUserIdToBoutiqueId,
        getDefaultBoutiqueId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'MSR template import plan failed';
      return NextResponse.json({ error: msg, fileSha256 }, { status: 400 });
    }

    if (templatePlan.duplicateStableKeys.length > 0) {
      return NextResponse.json(
        {
          error:
            'Duplicate stable keys in this file (same boutique, date, and employee). Remove duplicates before importing.',
          code: 'DUPLICATE_STABLE_KEYS',
          duplicateStableKeys: templatePlan.duplicateStableKeys,
          fileSha256,
        },
        { status: 400 }
      );
    }

    const parsed = templatePlan.parsed;
    for (const tm of parsed.totalMismatchWarnings) {
      warnings.push({
        rowNumber: tm.rowNumber,
        date: tm.dateKey,
        message: `Total mismatch: sum employees ${tm.sumEmployees} vs Total Sale After ${tm.sheetTotal} (delta ${tm.delta})`,
        totalAfter: tm.sheetTotal,
        sumEmployees: tm.sumEmployees,
        delta: tm.delta,
      });
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        fileSha256,
        importMode: 'msr-template',
        preview: {
          wouldCreate: templatePlan.wouldCreate,
          wouldUpdate: templatePlan.wouldUpdate,
          wouldNoChange: templatePlan.wouldNoChange,
          fileTotals: templatePlan.fileTotals,
          plannedRowSample: templatePlan.plannedRows.slice(0, 40),
        },
        duplicateStableKeys: [],
        warnings,
        skipped: [],
        ignoredColumns: [],
        msrLayoutKind: 'template_columns',
      });
    }

    const columnToUserMap = new Map(
      templatePlan.columnToUser.map((c) => [
        c.columnIndex,
        { userId: c.userId, employeeName: c.employeeName },
      ])
    );
    const templateUserIds = Array.from(new Set(templatePlan.columnToUser.map((c) => c.userId)));
    const userIdToBoutiqueTpl =
      templateUserIds.length > 0 ? await getUserIdToBoutiqueId(templateUserIds) : new Map<string, string>();
    const defaultBoutiqueTpl = await getDefaultBoutiqueId();

    const perDay = new Map<string, { dateKey: string; userId: string; employee: string; sales: number }>();
    const dailyTotals = new Map<string, number>();
    let totalSalesApplied = 0;
    let lockedCount = 0;
    let errorCount = 0;

    await prisma.$transaction(async (tx) => {
      const batch = await tx.salesEntryImportBatch.create({
        data: {
          source: 'EXCEL_IMPORT_MSR_V2',
          fileName: file.name,
          fileSha256,
          uploadedById: user.id,
          monthKey: monthParam,
          importMode: 'msr-template',
          summaryJson: {
            dryRunPreview: {
              wouldCreate: templatePlan.wouldCreate,
              wouldUpdate: templatePlan.wouldUpdate,
              wouldNoChange: templatePlan.wouldNoChange,
              fileTotals: templatePlan.fileTotals,
            },
          } as Prisma.InputJsonValue,
        },
      });
      importBatchId = batch.id;

      const importSeen = new Set<string>();
      for (const cell of parsed.rows) {
        const dedupeKey = `${cell.dateKey}\t${cell.columnIndex}`;
        if (importSeen.has(dedupeKey)) continue;
        importSeen.add(dedupeKey);

        const mapped = columnToUserMap.get(cell.columnIndex);
        if (!mapped) continue;

        const boutiqueId = userIdToBoutiqueTpl.get(mapped.userId) ?? defaultBoutiqueTpl;
        const stableKey = salesEntryImportStableKey(boutiqueId, cell.dateKey, mapped.userId);

        const existingAudit = await tx.salesEntry.findUnique({
          where: {
            boutiqueId_dateKey_userId: { boutiqueId, dateKey: cell.dateKey, userId: mapped.userId },
          },
          select: { id: true, amount: true, source: true },
        });
        const amountBefore = existingAudit?.amount ?? null;
        const sourceBefore = existingAudit?.source ?? null;

        let res: Awaited<ReturnType<typeof upsertCanonicalSalesEntry>>;
        try {
          res = await upsertCanonicalSalesEntry({
            kind: 'direct',
            boutiqueId,
            userId: mapped.userId,
            amount: cell.sales,
            source: SALES_ENTRY_SOURCE.EXCEL_IMPORT,
            actorUserId: user.id,
            date: cell.date,
            tx,
            entryImportBatchId: batch.id,
          });
        } catch {
          errorCount += 1;
          skipped.push({
            rowNumber: cell.sourceRowNumber,
            columnHeader: cell.employeeHeader,
            reason: 'Upsert failed',
          });
          await tx.salesEntryImportBatchLine.create({
            data: {
              batchId: batch.id,
              salesEntryId: null,
              action: 'REJECTED_ERROR',
              boutiqueId,
              dateKey: cell.dateKey,
              userId: mapped.userId,
              stableKey,
              incomingAmount: cell.sales,
              amountBefore,
              amountAfter: null,
              sourceBefore,
              rowLabel: `row ${cell.sourceRowNumber} ${cell.employeeHeader}`,
            },
          });
          continue;
        }

        let action: string;
        let salesEntryId: string | null = null;
        let amountAfter: number | null = null;

        if (res.status === 'created') {
          action = 'CREATED';
          salesEntryId = res.salesEntryId;
          amountAfter = cell.sales;
          importedCount += 1;
        } else if (res.status === 'updated') {
          action = 'UPDATED';
          salesEntryId = res.salesEntryId;
          amountAfter = cell.sales;
          updatedCount += 1;
        } else if (res.status === 'no_change') {
          action = 'NO_CHANGE';
          salesEntryId = res.salesEntryId;
          amountAfter = existingAudit?.amount ?? cell.sales;
          unchangedCount += 1;
        } else if (res.status === 'rejected_locked') {
          action = 'REJECTED_LOCK';
          lockedCount += 1;
          skipped.push({
            rowNumber: cell.sourceRowNumber,
            columnHeader: cell.employeeHeader,
            reason: 'Day locked in daily sales ledger',
          });
        } else if (res.status === 'rejected_precedence') {
          action = 'REJECTED_PRECEDENCE';
          errorCount += 1;
          skipped.push({
            rowNumber: cell.sourceRowNumber,
            columnHeader: cell.employeeHeader,
            reason: `Source precedence: existing "${res.existingSource ?? ''}" outranks EXCEL_IMPORT`,
          });
        } else {
          action = 'REJECTED_INVALID';
          errorCount += 1;
          skipped.push({
            rowNumber: cell.sourceRowNumber,
            columnHeader: cell.employeeHeader,
            reason: res.reason,
          });
        }

        await tx.salesEntryImportBatchLine.create({
          data: {
            batchId: batch.id,
            salesEntryId,
            action,
            boutiqueId,
            dateKey: cell.dateKey,
            userId: mapped.userId,
            stableKey,
            incomingAmount: cell.sales,
            amountBefore,
            amountAfter,
            sourceBefore,
            rowLabel: `row ${cell.sourceRowNumber} ${cell.employeeHeader}`,
          },
        });

        if (res.status === 'created' || res.status === 'updated') {
          totalSalesApplied += cell.sales;
          dailyTotals.set(cell.dateKey, (dailyTotals.get(cell.dateKey) ?? 0) + cell.sales);
          const dk = `${mapped.userId}|${cell.dateKey}`;
          const prev = perDay.get(dk);
          const nextSales = (prev?.sales ?? 0) + cell.sales;
          perDay.set(dk, {
            dateKey: cell.dateKey,
            userId: mapped.userId,
            employee: mapped.employeeName,
            sales: nextSales,
          });
        }
      }
    });

    skippedRowsCount =
      parsed.stats.skippedInvalidDateRows +
      parsed.stats.skippedSummaryRows +
      parsed.stats.skippedEmptyRows +
      parsed.stats.skippedNoNumericEmployeeRows;

    const dailyBreakdown = Array.from(dailyTotals.entries())
      .map(([dateKey, totalSar]) => ({ dateKey, totalSar }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const perEmployeePerDay = Array.from(perDay.values()).sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return a.employee.localeCompare(b.employee);
    });

    const employeeTotals = new Map<string, { employee: string; totalSales: number }>();
    for (const row of perEmployeePerDay) {
      const cur = employeeTotals.get(row.userId) ?? { employee: row.employee, totalSales: 0 };
      cur.totalSales += row.sales;
      employeeTotals.set(row.userId, cur);
    }
    const rankedArr = Array.from(employeeTotals.entries())
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.totalSales - a.totalSales);
    const ranked = rankedArr.map((r, i) => ({
      rank: i + 1,
      employee: r.employee,
      userId: r.userId,
      totalSales: r.totalSales,
      contributionPct:
        totalSalesApplied > 0 ? Math.round((r.totalSales * 10000) / totalSalesApplied) / 100 : 0,
    }));

    employeeSummary = { ranked, perEmployeePerDay };
    importSummary = {
      totalRowsRead: parsed.stats.totalRowsScanned,
      validRowsProcessed: parsed.stats.validRowsProcessed,
      rowsGenerated: parsed.stats.rowsGenerated,
      newCount: importedCount,
      updatedCount,
      identicalCount: unchangedCount,
      lockedCount,
      errorCount,
      skippedEmptyRows: parsed.stats.skippedEmptyRows,
      skippedSummaryRows: parsed.stats.skippedSummaryRows,
      skippedNoNumericRows: parsed.stats.skippedNoNumericEmployeeRows,
      skippedMonthFilteredRows: parsed.stats.skippedMonthFilteredRows,
      invalidDateRows: parsed.stats.skippedInvalidDateRows,
      invalidSalesValues: parsed.stats.invalidSalesValuesInValidRows,
      totalSales: totalSalesApplied,
      totalMismatchRowCount: parsed.totalMismatchWarnings.length,
      dailyBreakdown,
    };
  }

  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : dateKeyUTC(new Date()).slice(0, 7);
  await logSalesTargetAudit(monthKey, 'IMPORT_SALES', user.id, {
    importedCount,
    updatedCount,
    skippedCount: skipped.length,
    warningsCount: warnings.length,
    mode: useMsrTemplate ? 'msr_template' : useMsrLegacy ? 'msr' : useMsrMode ? 'msr' : 'simple',
    importBatchId: importBatchId ?? null,
    fileSha256,
    dryRun: dryRun || undefined,
  });

  return NextResponse.json({
    importedCount,
    updatedCount,
    unchangedCount,
    skippedCount: skipped.length,
    skippedRowCount: skippedRowsCount,
    skippedRowsCount,
    skipped,
    warnings,
    ignoredColumns: useMsrMode ? Array.from(ignoredColumnsSet) : [],
    importSummary: importSummary ?? null,
    employeeSummary: employeeSummary ?? null,
    msrLayoutKind: useMsrMode ? (useMsrTemplate ? 'template_columns' : 'legacy_msr') : null,
    importBatchId: importBatchId ?? null,
    fileSha256,
    dryRun: dryRun || undefined,
  });
}
