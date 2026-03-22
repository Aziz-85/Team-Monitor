/**
 * POST /api/sales/import/matrix
 * Multipart: file (Excel), mode (preview | apply), sourceFilter?, force?
 * Persists via upsertCanonicalSalesEntry → **SalesEntry** (canonical). Scope validated via Boutique.code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { getTrustedOperationalBoutiqueId } from '@/lib/scope/operationalScope';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { normalizeDateOnlyRiyadh } from '@/lib/time';
import { parseMatrixWorkbook, type MatrixParseIssue } from '@/lib/sales/importMatrix';
import { monthDaysUTC } from '@/lib/dates/safeCalendar';
import { logAudit } from '@/lib/audit';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type ApplyIssue = MatrixParseIssue & { existingAmount?: number };

async function checkAuth(boutiqueId: string, request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return { allowed: false as const, status: 401 as const, error: 'Unauthorized' };
  }
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return { allowed: true as const, user };
  }
  if (user.role === 'MANAGER') {
    const trustedId = await getTrustedOperationalBoutiqueId(user, request);
    if (!trustedId || boutiqueId !== trustedId) {
      return { allowed: false as const, status: 403 as const, error: 'Boutique not in your operational scope' };
    }
    const can = await canManageSalesInBoutique(user.id, user.role, boutiqueId, trustedId);
    if (can) return { allowed: true as const, user };
  }
  return { allowed: false as const, status: 403 as const, error: 'Forbidden' };
}

export async function POST(request: NextRequest) {
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const boutiqueId = scopeResult.boutiqueId;

  const auth = await checkAuth(boutiqueId, request);
  if (!auth.allowed) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user!;

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { code: true },
  });
  if (!boutique) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }
  const scopeId = boutique.code; // file ScopeId must match this (e.g. S02)
  const expectedScopeId = (scopeId ?? '').trim().toUpperCase();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const mode = (formData.get('mode') as string)?.trim() ?? 'preview';
  const force = (formData.get('force') as string)?.toLowerCase() === 'true';
  const monthParam = (formData.get('month') as string | null)?.trim() ?? '';

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (mode !== 'preview' && mode !== 'apply') {
    return NextResponse.json({ error: 'mode must be preview or apply' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
  }

  const parseResult = parseMatrixWorkbook(buf);
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: parseResult.error, issues: parseResult.issues ?? [] },
      { status: 400 }
    );
  }

  const { cells, issues: parseIssues, monthRange, rowsRead, cellsParsed, ignoredEmptyCells } = parseResult;

  if (process.env.NODE_ENV !== 'production') {
    // 1) Request scope
    console.log('[IMPORT_ROUTE_DEBUG]', 'boutiqueId', boutiqueId, 'scopeId', scopeId, 'mode', mode, 'force', force);
    // 2) Month detection
    console.log('[IMPORT_ROUTE_DEBUG]', 'monthRange', monthRange, 'rowsRead', rowsRead, 'cellsParsed', cellsParsed);
    // 3) All dateKeys before any filter
    const allKeys = Array.from(new Set(cells.map((c) => c.dateKey))).sort();
    console.log('[IMPORT_ROUTE_DEBUG]', 'allDateKeys[0..14]', allKeys.slice(0, 15), 'allDateKeysLast[0..4]', allKeys.slice(-5));
  }

  // Scope validation: only include cells where scopeId matches boutique.code (normalized; parser fill-down for blank col A)
  const scopeMismatch = cells.some(
    (c) => (c.scopeId ?? '').trim().toUpperCase() !== expectedScopeId
  );
  const scopeMismatchIssues: MatrixParseIssue[] = scopeMismatch
    ? [{ code: 'SCOPE_MISMATCH', message: `File ScopeId does not match boutique (expected ${scopeId})`, rowIndex: undefined, colHeader: undefined, dateKey: undefined }]
    : [];
  const matchingCells = cells.filter(
    (c) => (c.scopeId ?? '').trim().toUpperCase() === expectedScopeId
  );

  const matchingKeys = Array.from(new Set(matchingCells.map((c) => c.dateKey))).sort();
  const scopeMismatchSample = cells
    .filter((c) => (c.scopeId ?? '').trim().toUpperCase() !== expectedScopeId)
    .slice(0, 5)
    .map((c) => ({ scopeId: c.scopeId, dateKey: c.dateKey, rowIndex: c.rowIndex, col: c.colHeader }));

  if (process.env.NODE_ENV !== 'production') {
    // 4) After scope filter
    console.log('[IMPORT_ROUTE_DEBUG]', 'matchingCells', matchingCells.length, 'matchingDateKeys[0..14]', matchingKeys.slice(0, 15), 'matchingDateKeysLast[0..4]', matchingKeys.slice(-5));
    console.log('[IMPORT_ROUTE_DEBUG]', 'scopeMismatchSample', scopeMismatchSample);
  }

  // Primary month: explicit param if valid YYYY-MM, else derive from latest dateKey in matching data.
  const derivedPrimaryMonthFromKeys = (matchingKeys[matchingKeys.length - 1] ?? '').slice(0, 7);
  const primaryMonth = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : derivedPrimaryMonthFromKeys;

  if (process.env.NODE_ENV !== 'production') {
    // 5) Primary month chosen
    console.log('[IMPORT_ROUTE_DEBUG]', 'requestedMonthParam', monthParam, 'finalPrimaryMonth', primaryMonth, 'derivedPrimaryMonthFromKeys', derivedPrimaryMonthFromKeys);
  }

  const monthPrefix = primaryMonth + '-';
  const monthCells = matchingCells.filter((c) => c.dateKey.startsWith(monthPrefix));
  const monthKeys = Array.from(new Set(monthCells.map((c) => c.dateKey))).sort();

  if (process.env.NODE_ENV !== 'production') {
    // 6) After month filter
    console.log('[IMPORT_ROUTE_DEBUG]', 'monthCells', monthCells.length, 'monthDateKeys[0..14]', monthKeys.slice(0, 15), 'monthDateKeysLast[0..4]', monthKeys.slice(-5));
  }

  // Build map by dateKey (ignore prev-month row; import strictly by calendar day key).
  const cellsByDateKey = new Map<string, typeof monthCells>();
  for (const c of monthCells) {
    const list = cellsByDateKey.get(c.dateKey) ?? [];
    list.push(c);
    cellsByDateKey.set(c.dateKey, list);
  }

  const firstDayKey = `${primaryMonth}-01`;

  if (process.env.NODE_ENV !== 'production') {
    // 7) Right before MONTH_FIRST_DAY_MISSING check
    console.log('[IMPORT_ROUTE_DEBUG]', 'firstDayKey', firstDayKey, 'hasMonth01', monthCells.some((c) => c.dateKey === firstDayKey));
  }

  if (!/^\d{4}-\d{2}$/.test(primaryMonth) || !cellsByDateKey.has(firstDayKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MONTH_FIRST_DAY_MISSING',
        message: `Month first day missing in sheet (expected cells for ${firstDayKey}). Ignore prev-month row and ensure row for ${firstDayKey} exists.`,
        primaryMonth,
        firstDayKey,
        matchingDateKeysFirst15: matchingKeys.slice(0, 15),
        matchingDateKeysLast5: matchingKeys.slice(-5),
        monthDateKeysFirst15: monthKeys.slice(0, 15),
        monthDateKeysLast5: monthKeys.slice(-5),
        scopeIdExpected: scopeId,
        scopeIdFoundSample: scopeMismatchSample,
        issues: [
          ...parseIssues,
          {
            code: 'MONTH_FIRST_DAY_MISSING',
            message: `No parsed cells for ${firstDayKey}; file may contain a previous-month day row.`,
            rowIndex: undefined,
            colHeader: undefined,
            dateKey: firstDayKey,
          },
        ],
      },
      { status: 400 }
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    const firstThreeKeys = monthDaysUTC(primaryMonth).slice(0, 3).filter((dk) => cellsByDateKey.has(dk));
    console.log('[IMPORT_MATRIX_DEBUG] totalCells', matchingCells.length, 'monthCells', monthCells.length, 'firstThreeDayKeys', firstThreeKeys, 'hasMonth01', cellsByDateKey.has(firstDayKey));
  }

  // Resolve empId -> userId (User.empId)
  const empIds = Array.from(new Set(monthCells.map((c) => c.empId)));
  const usersByEmpId = await prisma.user.findMany({
    where: { empId: { in: empIds } },
    select: { id: true, empId: true },
  });
  const empIdToUserId = new Map(usersByEmpId.map((u) => [u.empId, u.id]));
  const unknownEmpIssues: MatrixParseIssue[] = [];
  const toUpsert: { dateKey: string; userId: string; amount: number; roundedFrom?: number }[] = [];

  const dayKeys = monthDaysUTC(primaryMonth);
  for (const dayKey of dayKeys) {
    const dayCells = cellsByDateKey.get(dayKey) ?? [];
    for (const c of dayCells) {
      const userId = empIdToUserId.get(c.empId);
      if (!userId) {
        unknownEmpIssues.push({
          code: 'UNKNOWN_EMP_ID',
          message: `No user found for EmpID ${c.empId}`,
          rowIndex: c.rowIndex,
          colHeader: c.colHeader,
          dateKey: c.dateKey,
        });
        continue;
      }
      toUpsert.push({
        dateKey: c.dateKey,
        userId,
        amount: c.amount,
        ...(c.roundedFrom != null && { roundedFrom: c.roundedFrom }),
      });
    }
  }

  const allIssues: MatrixParseIssue[] = [
    ...parseIssues,
    ...scopeMismatchIssues,
    ...unknownEmpIssues,
  ];

  // Preview response
  const totalsByEmp = aggregateTotalsByEmp(toUpsert, empIdToUserId);
  const sample = toUpsert.slice(0, 10).map((u) => ({
    dateKey: u.dateKey,
    empId: usersByEmpId.find((x) => x.id === u.userId)?.empId ?? '',
    amount: u.amount,
  }));

  if (mode === 'preview') {
    return NextResponse.json({
      ok: true,
      mode: 'preview',
      boutiqueId,
      scopeId,
      monthDetectedRange: { minMonth: monthRange.minMonth, maxMonth: monthRange.maxMonth },
      rowsRead,
      cellsParsed,
       ignoredEmptyCells,
      toUpsertCount: toUpsert.length,
      totalsByEmp,
      sample,
      issues: allIssues,
    });
  }

  // Apply: reject if scope mismatch
  if (scopeMismatch) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SCOPE_MISMATCH',
        message: `File ScopeId does not match current boutique (expected ${scopeId}). Import rejected.`,
        issues: allIssues,
      },
      { status: 400 }
    );
  }

  const applyIssues: ApplyIssue[] = [...allIssues];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const { dateKey, userId, amount, roundedFrom } of toUpsert) {
      const date = normalizeDateOnlyRiyadh(dateKey);
      const empId = usersByEmpId.find((x) => x.id === userId)?.empId ?? '';

      if (roundedFrom != null) {
        await logAudit(
          user.id,
          'SALES_AMOUNT_ROUNDED',
          'SalesEntry',
          null,
          null,
          JSON.stringify({
            original: roundedFrom,
            rounded: amount,
            dateKey,
            employeeId: empId,
            boutiqueId: scopeId,
            source: 'matrix_import',
          }),
          'Sales amount rounded to integer',
          { boutiqueId: scopeId }
        );
      }

      const existing = await tx.salesEntry.findUnique({
        where: {
          boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId },
        },
        select: { id: true, amount: true, source: true },
      });

      /** ADMIN/SUPER_ADMIN only — see salesEntryWritePrecedence + upsertCanonicalSalesEntry */
      const forceAdminOverride =
        force === true && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

      if (existing?.source === 'LEDGER' && forceAdminOverride) {
        applyIssues.push({
          code: 'FORCED_OVERWRITE',
          message: `Overwrote LEDGER entry for ${dateKey}`,
          dateKey,
          existingAmount: existing.amount,
        });
      }

      const applyResult = await upsertCanonicalSalesEntry({
        kind: 'direct',
        boutiqueId,
        userId,
        amount,
        source: SALES_ENTRY_SOURCE.MATRIX,
        actorUserId: user.id,
        date,
        tx,
        forceAdminOverride,
        allowLockedOverride: !!(forceAdminOverride && existing?.source === 'LEDGER'),
      });

      if (applyResult.status === 'rejected_locked') {
        skipped += 1;
        applyIssues.push({
          code: 'DAY_LOCKED',
          message: `Skipped: daily ledger is locked for ${dateKey}`,
          dateKey,
        });
        continue;
      }
      if (applyResult.status === 'rejected_precedence') {
        skipped += 1;
        applyIssues.push({
          code: 'PRECEDENCE_CONFLICT',
          message: `Skipped: existing source "${applyResult.existingSource ?? ''}" outranks MATRIX`,
          dateKey,
          existingAmount: existing?.amount,
        });
        continue;
      }
      if (applyResult.status === 'rejected_invalid') {
        skipped += 1;
        applyIssues.push({
          code: 'INVALID',
          message: applyResult.reason,
          dateKey,
        });
        continue;
      }

      if (applyResult.status === 'created') inserted += 1;
      else if (applyResult.status === 'updated') updated += 1;
      else if (applyResult.status === 'no_change' && existing) updated += 1;
    }
  });

  return NextResponse.json({
    ok: true,
    mode: 'apply',
    boutiqueId,
    inserted,
    updated,
    skipped,
    issuesCount: applyIssues.length,
    issues: applyIssues,
  });
}

function aggregateTotalsByEmp(
  toUpsert: { dateKey: string; userId: string; amount: number }[],
  empIdToUserId: Map<string, string>
): { empId: string; userId: string; amountSum: number }[] {
  const userIdToEmpId = new Map<string, string>();
  empIdToUserId.forEach((uid, eid) => userIdToEmpId.set(uid, eid));
  const sumByUser = new Map<string, number>();
  for (const u of toUpsert) {
    sumByUser.set(u.userId, (sumByUser.get(u.userId) ?? 0) + u.amount);
  }
  return Array.from(sumByUser.entries()).map(([userId, amountSum]) => ({
    empId: userIdToEmpId.get(userId) ?? '',
    userId,
    amountSum,
  }));
}
