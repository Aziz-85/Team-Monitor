/**
 * POST /api/sales/import/yearly
 * Multipart: file, dryRun ("1"|"0", default "1"), month (optional "YYYY-MM")
 * RBAC: ADMIN, MANAGER. Boutique scope required (403 if none).
 * Reads sheet "Import_2026", Date column, emp_XXXX columns; idempotent upsert.
 * Empty and "-" ignored. After write, syncs to SalesEntry for affected dates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { parseYearlyImportExcel } from '@/lib/sales/parseYearlyImportExcel';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { formatMonthKey, normalizeMonthKey } from '@/lib/time';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER'] as const;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xlsm'];

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
  if (!scopeResult.ok) {
    return scopeResult.res;
  }
  const { boutiqueId } = scopeResult;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const dryRunRaw = (formData.get('dryRun') as string)?.trim() ?? '1';
  const dryRun = dryRunRaw === '0' ? false : true;
  const monthFilter = (formData.get('month') as string)?.trim() || null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  const fileName = (file.name || '').toLowerCase();
  const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  if (!hasAllowedExt) {
    return NextResponse.json({ error: 'Only .xlsx or .xlsm files are allowed.' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parseResult = parseYearlyImportExcel(buf);
  if (!parseResult.ok) {
    return NextResponse.json({ error: parseResult.error }, { status: 400 });
  }
  if (parseResult.errors.length > 0) {
    return NextResponse.json(
      { error: 'Invalid amounts in import', errors: parseResult.errors },
      { status: 400 }
    );
  }

  const { employeeColumns, rows, skippedEmpty, skippedDash } = parseResult;

  const empIdsFromSheet = Array.from(new Set(employeeColumns.map((c) => c.empId)));
  const employeesInBoutique = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: empIdsFromSheet } },
    select: { empId: true },
  });
  const mappedEmpIds = new Set(employeesInBoutique.map((e) => e.empId));
  const unmappedEmpIds = empIdsFromSheet.filter((id) => !mappedEmpIds.has(id));

  const monthFilterNorm = monthFilter ? normalizeMonthKey(monthFilter) : null;

  const affectedDates: string[] = [];
  const queue: { date: Date; dateKey: string; empId: string; amountSar: number }[] = [];
  const skippedByDateKey = new Map<string, { skippedEmptyCount: number; skippedDashCount: number }>();

  for (const row of rows) {
    if (monthFilterNorm && formatMonthKey(row.date) !== monthFilterNorm) continue;
    affectedDates.push(row.dateKey);
    skippedByDateKey.set(row.dateKey, {
      skippedEmptyCount: row.skippedEmptyCount,
      skippedDashCount: row.skippedDashCount,
    });
    for (const v of row.values) {
      if (!mappedEmpIds.has(v.empId)) continue;
      queue.push({
        date: row.date,
        dateKey: row.dateKey,
        empId: v.empId,
        amountSar: v.amountSar,
      });
    }
  }

  const uniqueDates = Array.from(new Set(affectedDates));

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      daysAffected: uniqueDates,
      unmappedEmpIds,
      skippedEmpty,
      skippedDash,
      inserted: 0,
      updated: 0,
      rowsQueued: queue.length,
    });
  }

  let inserted = 0;
  let updated = 0;
  const perDateSummary: {
    date: string;
    linesTotalBefore: number;
    linesTotalAfter: number;
    insertedLinesCount: number;
    updatedLinesCount: number;
    skippedEmptyCount: number;
    linesTotalSar: number;
    managerTotalSar: number;
    diffSar: number;
  }[] = [];

  for (const dateKey of uniqueDates) {
    const dayQueue = queue.filter((q) => q.dateKey === dateKey);
    if (dayQueue.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[yearly-import] Skip date (parsedRowsCount=0):', dateKey);
      }
      continue;
    }

    const date = dayQueue[0].date;
    const parsedRowsCount = dayQueue.length;

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
        metadata: { yearlyImport: true, totalSar: 0 },
      });
    }

    const linesTotalBefore = summary.lines.reduce((s, l) => s + l.amountSar, 0);
    const existingByEmp = new Map(summary.lines.map((l) => [l.employeeId, l]));
    let dayInserted = 0;
    let dayUpdated = 0;

    const wasLocked = summary.status === 'LOCKED';
    if (wasLocked) {
      await prisma.boutiqueSalesSummary.update({
        where: { id: summary.id },
        data: { status: 'DRAFT', lockedById: null, lockedAt: null },
      });
      await recordSalesLedgerAudit({
        boutiqueId,
        date,
        actorId: user.id,
        action: 'POST_LOCK_EDIT',
        reason: 'Yearly import; auto-unlock',
        metadata: { yearlyImport: true },
      });
    }

    for (const item of dayQueue) {
      if (item.amountSar === 0) continue;
      const existed = existingByEmp.has(item.empId);
      await prisma.boutiqueSalesLine.upsert({
        where: {
          summaryId_employeeId: { summaryId: summary.id, employeeId: item.empId },
        },
        create: {
          summaryId: summary.id,
          employeeId: item.empId,
          amountSar: item.amountSar,
          source: 'YEARLY_IMPORT',
        },
        update: {
          amountSar: item.amountSar,
          source: 'YEARLY_IMPORT',
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

    const managerTotalSar = summary.totalSar ?? 0;
    const shouldAutoSetManagerTotal = managerTotalSar === 0;
    if (shouldAutoSetManagerTotal) {
      await prisma.boutiqueSalesSummary.update({
        where: { id: summary.id },
        data: { totalSar: linesTotalSar },
      });
    }
    const finalManagerTotalSar = shouldAutoSetManagerTotal ? linesTotalSar : managerTotalSar;
    const diffSar = finalManagerTotalSar - linesTotalSar;

    const skipped = skippedByDateKey.get(dateKey);
    const skippedEmptyCount = skipped?.skippedEmptyCount ?? 0;
    if (process.env.NODE_ENV === 'development') {
      console.info('[yearly-import]', {
        date: dateKey,
        parsedCount: parsedRowsCount,
        skippedEmpty: skippedEmptyCount,
        updated: dayUpdated,
        inserted: dayInserted,
        beforeTotal: linesTotalBefore,
        afterTotal: linesTotalSar,
      });
    }
    perDateSummary.push({
      date: dateKey,
      linesTotalBefore,
      linesTotalAfter: linesTotalSar,
      insertedLinesCount: dayInserted,
      updatedLinesCount: dayUpdated,
      skippedEmptyCount: skippedEmptyCount,
      linesTotalSar,
      managerTotalSar: finalManagerTotalSar,
      diffSar,
    });

    await recordSalesLedgerAudit({
      boutiqueId,
      date,
      actorId: user.id,
      action: 'IMPORT_APPLY',
      metadata: { yearlyImport: true, linesCount: dayQueue.length },
    });

    await syncDailyLedgerToSalesEntry({
      boutiqueId,
      date,
      actorUserId: user.id,
    });
  }

  return NextResponse.json({
    dryRun: false,
    daysAffected: uniqueDates,
    unmappedEmpIds,
    skippedEmpty,
    skippedDash,
    inserted,
    updated,
    perDateSummary,
  });
}
