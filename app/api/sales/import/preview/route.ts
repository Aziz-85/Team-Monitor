/**
 * POST /api/sales/import/preview
 * Multipart: file, month (YYYY-MM), includePreviousMonth (true|false).
 * Returns dry-run JSON. Scope from session (operational boutique).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { parseMatrixBuffer } from '@/lib/sales/matrixImportParse';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] as const;

export async function POST(request: NextRequest) {
  try {
    await requireRole([...ALLOWED_ROLES]);
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

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  if (!(file.name ?? '').toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Only .xlsx files are allowed' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let result;
  try {
    result = await parseMatrixBuffer(buf, { scopeId, month: monthParam, includePreviousMonth }, prisma);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Parse failed';
    if (msg === 'NO_EMPLOYEE_COLUMNS') {
      return NextResponse.json({
        dryRun: true,
        month: monthParam,
        scopeId,
        sheetName: 'DATA_MATRIX',
        mappedEmployees: [],
        unmappedEmployees: [],
        inserted: 0,
        updated: 0,
        skippedEmpty: 0,
        applyAllowed: false,
        applyBlockReasons: ['NO_EMPLOYEE_COLUMNS'],
        blockingErrorsCount: 1,
        blockingErrors: [{ type: 'NO_EMPLOYEE_COLUMNS', message: 'No employee columns found before TOTAL/Notes.', row: 0, col: 0 }],
        sampleNonBlankCells: [],
        diagnostic: { employeeStartCol: 4, employeeEndCol: 0, totalRows: 0, totalCols: 0 },
      }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const [y, m] = result.month.split('-').map(Number);
  const rangeStart = new Date(Date.UTC(y, m - 1, 1));
  const rangeEnd = new Date(Date.UTC(y, m, 0));
  const existing = await prisma.boutiqueSalesSummary.findMany({
    where: { boutiqueId: scopeId, date: { gte: rangeStart, lte: rangeEnd } },
    include: { lines: true },
  });
  const summaryByDate = new Map(existing.map((s) => [s.date.toISOString().slice(0, 10), s]));
  let inserted = 0;
  let updated = 0;
  for (const item of result.queue) {
    const summary = summaryByDate.get(item.dateKey);
    const existed = summary?.lines.some((l) => l.employeeId === item.employeeId);
    if (existed) updated += 1;
    else inserted += 1;
  }

  return NextResponse.json({
    dryRun: true,
    month: result.month,
    scopeId: result.scopeId,
    sheetName: result.sheetName,
    mappedEmployees: result.mappedEmployees,
    unmappedEmployees: result.unmappedEmployees,
    inserted,
    updated,
    skippedEmpty: result.skippedEmpty,
    applyAllowed: result.applyAllowed,
    applyBlockReasons: result.applyBlockReasons,
    blockingErrorsCount: result.blockingErrors.length,
    blockingErrors: result.blockingErrors.slice(0, 50),
    sampleNonBlankCells: result.sampleNonBlankCells.slice(0, 12),
    diagnostic: {
      employeeStartCol: 4,
      employeeEndCol: result.employeeEndCol + 1,
      totalRows: result.rowCount,
      totalCols: result.headerCellCount,
    },
  });
}
