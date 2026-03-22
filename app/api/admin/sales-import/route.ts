/**
 * Admin Excel → **SalesEntry** (canonical). BoutiqueSalesLine / batches are not used here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logSalesTargetAudit } from '@/lib/sales-target-audit';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { dateKeyUTC, parseExcelDateToYMD, ymdToUTCNoon } from '@/lib/dates/safeCalendar';
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
const MAX_HEADER_SCAN = 15;
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
  const importMode = (formData.get('importMode') as string)?.toLowerCase() || 'auto';
  const monthParam = (formData.get('month') as string)?.trim() || '';

  const buf = Buffer.from(await file.arrayBuffer());
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
  const useMsrModeExplicit = importMode === 'msr';
  if (useMsrModeExplicit && !dataSheetName) {
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
    defval: '',
    raw: false,
  }) as unknown[][];

  let useMsrMode = false;
  let headerRow: string[] = [];
  let headerIndex = 0;

  if (rows.length >= 1) {
    if (importMode === 'msr' || (dataSheetName && importMode !== 'simple')) {
      for (let r = 0; r < Math.min(rows.length, MAX_HEADER_SCAN); r++) {
        const cells = (rows[r] as unknown[]).map((c) => String(c ?? '').trim());
        const hasDate = cells.some((c) => c.toLowerCase().includes('date'));
        const hasTotalSaleAfter = cells.some((c) => c.toLowerCase().includes('total sale after'));
        if (hasDate && hasTotalSaleAfter) {
          headerRow = cells;
          headerIndex = r;
          useMsrMode = true;
          break;
        }
      }
    }
    if (!useMsrMode) {
      headerRow = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
    }
  }

  if (importMode === 'msr' && !useMsrMode) {
    return NextResponse.json(
      { error: "Header row not found. The Data sheet must contain a row with both 'Date' and 'Total Sale After' columns within the first 15 rows." },
      { status: 400 }
    );
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
      skipped: [],
      warnings: [],
      ignoredColumns: [],
    });
  }

  const skipped: SkippedItem[] = [];
  const warnings: WarningItem[] = [];
  const ignoredColumnsSet = new Set<string>();
  let importedCount = 0;
  let updatedCount = 0;
  let skippedRowsCount = 0;

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
        const existing = await prisma.salesEntry.findUnique({
          where: { boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId } },
        });
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
        else if (res.status === 'no_change' && existing) updatedCount += 1;
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
  } else {
    const header = headerRow;
    const dateCol = header.findIndex((h) => h.toLowerCase().includes('date'));
    const totalSaleAfterCol = header.findIndex((h) =>
      h.toLowerCase().includes('total sale after')
    );
    if (dateCol < 0 || totalSaleAfterCol < 0) {
      return NextResponse.json(
        { error: 'MSR sheet must have Date and Total Sale After columns' },
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
        const userId = empIdToUserId.get(label)!;
        employeeCols.push({ col: c, empId: label, userId });
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
      const dateKey = rawToDateKey(row[dateCol]);
      if (dateKey && monthParam && dateKey.startsWith(monthParam + '-')) {
        dateKeysInRequestedMonth.add(dateKey);
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
          skipped: [],
          warnings: [],
        },
        { status: 400 }
      );
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
          const existing = await prisma.salesEntry.findUnique({
            where: { boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId } },
          });
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
          else if (res.status === 'no_change' && existing) updatedCount += 1;
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
    mode: useMsrMode ? 'msr' : 'simple',
  });

  return NextResponse.json({
    importedCount,
    updatedCount,
    skippedCount: skipped.length,
    skippedRowCount: skippedRowsCount,
    skippedRowsCount,
    skipped,
    warnings,
    ignoredColumns: useMsrMode ? Array.from(ignoredColumnsSet) : [],
  });
}
