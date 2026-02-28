/**
 * POST /api/sales/import/apply
 * Same payload as preview. Performs DB writes when no blocking errors and applyAllowed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { parseMatrixBuffer } from '@/lib/sales/matrixImportParse';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] as const;

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
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!result.applyAllowed) {
    return NextResponse.json(
      {
        error: 'Apply not allowed',
        applyAllowed: false,
        applyBlockReasons: result.applyBlockReasons,
        blockingErrorsCount: result.blockingErrors.length,
      },
      { status: 400 }
    );
  }

  const queue = result.queue;
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
          enteredById: user!.id,
        },
        include: { lines: true },
      });
      await recordSalesLedgerAudit({
        boutiqueId: scopeId,
        date,
        actorId: user!.id,
        action: 'SUMMARY_CREATE',
        metadata: { salesImportMatrix: true },
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
        actorId: user!.id,
        action: 'POST_LOCK_EDIT',
        reason: 'Sales import; auto-unlock',
        metadata: { salesImportMatrix: true },
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
      if (existed) updated += 1;
      else inserted += 1;
    }

    const linesAfter = await prisma.boutiqueSalesLine.findMany({
      where: { summaryId: summary.id },
      select: { amountSar: true },
    });
    const linesTotalSar = linesAfter.reduce((s, l) => s + l.amountSar, 0);
    if ((summary.totalSar ?? 0) === 0) {
      await prisma.boutiqueSalesSummary.update({
        where: { id: summary.id },
        data: { totalSar: linesTotalSar },
      });
    }

    await recordSalesLedgerAudit({
      boutiqueId: scopeId,
      date,
      actorId: user!.id,
      action: 'IMPORT_APPLY',
      metadata: { salesImportMatrix: true, linesCount: dayQueue.length },
    });

    await syncDailyLedgerToSalesEntry({
      boutiqueId: scopeId,
      date,
      actorUserId: user!.id,
    });
  }

  return NextResponse.json({
    success: true,
    dryRun: false,
    month: result.month,
    includePreviousMonth,
    sheetName: result.sheetName,
    mappedEmployees: result.mappedEmployees,
    unmappedEmployees: result.unmappedEmployees,
    inserted,
    updated,
    skippedEmpty: result.skippedEmpty,
  });
}
