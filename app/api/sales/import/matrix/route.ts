/**
 * POST /api/sales/import/matrix
 * Multipart: file (Excel), mode (preview | apply), sourceFilter?, force?
 * Persists to SalesEntry; scope validated via Boutique.code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { normalizeDateOnlyRiyadh } from '@/lib/time';
import {
  parseMatrixWorkbook,
  type MatrixParseIssue,
} from '@/lib/sales/importMatrix';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type ApplyIssue = MatrixParseIssue & { existingAmount?: number };

async function checkAuth(boutiqueId: string) {
  const user = await getSessionUser();
  if (!user) {
    return { allowed: false as const, status: 401 as const, error: 'Unauthorized' };
  }
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return { allowed: true as const, user };
  }
  if (user.role === 'MANAGER') {
    const can = await canManageSalesInBoutique(user.id, user.role, boutiqueId);
    if (can) return { allowed: true as const, user };
  }
  return { allowed: false as const, status: 403 as const, error: 'Forbidden' };
}

export async function POST(request: NextRequest) {
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const boutiqueId = scopeResult.boutiqueId;

  const auth = await checkAuth(boutiqueId);
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

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const mode = (formData.get('mode') as string)?.trim() ?? 'preview';
  const force = (formData.get('force') as string)?.toLowerCase() === 'true';

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

  // Scope validation: only include cells where scopeId matches boutique.code
  const scopeMismatch = cells.some((c) => c.scopeId !== scopeId);
  const scopeMismatchIssues: MatrixParseIssue[] = scopeMismatch
    ? [{ code: 'SCOPE_MISMATCH', message: `File ScopeId does not match boutique (expected ${scopeId})`, rowIndex: undefined, colHeader: undefined, dateKey: undefined }]
    : [];
  const matchingCells = cells.filter((c) => c.scopeId === scopeId);

  // Resolve empId -> userId (User.empId)
  const empIds = Array.from(new Set(matchingCells.map((c) => c.empId)));
  const usersByEmpId = await prisma.user.findMany({
    where: { empId: { in: empIds } },
    select: { id: true, empId: true },
  });
  const empIdToUserId = new Map(usersByEmpId.map((u) => [u.empId, u.id]));
  const unknownEmpIssues: MatrixParseIssue[] = [];
  const toUpsert: { dateKey: string; userId: string; amount: number }[] = [];
  for (const c of matchingCells) {
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
    toUpsert.push({ dateKey: c.dateKey, userId, amount: c.amount });
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
    for (const { dateKey, userId, amount } of toUpsert) {
      const date = normalizeDateOnlyRiyadh(dateKey);
      const month = dateKey.slice(0, 7);

      const existing = await tx.salesEntry.findUnique({
        where: {
          boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId },
        },
        select: { id: true, amount: true, source: true },
      });

      if (existing?.source === 'LEDGER' && !force) {
        skipped += 1;
        applyIssues.push({
          code: 'LEDGER_CONFLICT',
          message: `Skipped: existing LEDGER entry (amount ${existing.amount}) for ${dateKey}`,
          dateKey,
          existingAmount: existing.amount,
        });
        continue;
      }

      if (existing?.source === 'LEDGER' && force) {
        applyIssues.push({
          code: 'FORCED_OVERWRITE',
          message: `Overwrote LEDGER entry for ${dateKey}`,
          dateKey,
          existingAmount: existing.amount,
        });
      }

      await tx.salesEntry.upsert({
        where: {
          boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId },
        },
        create: {
          boutiqueId,
          date,
          dateKey,
          month,
          userId,
          amount,
          source: 'IMPORT',
          createdById: user.id,
        },
        update: {
          amount,
          source: 'IMPORT',
          createdById: user.id,
          updatedAt: new Date(),
        },
      });

      if (existing) updated += 1;
      else inserted += 1;
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
