/**
 * Yearly employee sales import — boutique-owned writes with assignment validation warnings.
 * All sales land on the uploaded operational boutique (ledger + SalesEntry source YEARLY_IMPORT).
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { parseYearlyImportExcel } from '@/lib/sales/parseYearlyImportExcel';
import { parseYearlyImportReadme } from '@/lib/sales/parseYearlyImportReadme';
import {
  buildAssignmentWarnings,
  resolveEmployeeAssignmentAtDate,
} from '@/lib/sales/employeeAssignmentAtDate';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { salesEntryImportStableKey } from '@/lib/sales/salesEntryImportStableKey';

export const YEARLY_IMPORT_ENTRY_SOURCE = SALES_ENTRY_SOURCE.YEARLY_IMPORT;

export type YearlyImportRowAction = 'INSERT' | 'UPDATE' | 'NO_CHANGE' | 'SKIPPED' | 'ERROR';

export type YearlyImportPreviewRow = {
  rowNumber: number;
  saleDate: string;
  empId: string;
  employeeName: string;
  amount: number;
  uploadedBoutiqueId: string;
  uploadedBoutiqueName: string | null;
  historicalBoutiqueId: string | null;
  historicalBoutiqueName: string | null;
  currentBoutiqueId: string | null;
  currentBoutiqueName: string | null;
  currentAmount: number | null;
  newAmount: number;
  action: YearlyImportRowAction;
  warnings: string[];
  reason: string | null;
  status: string;
};

export type YearlyImportPreviewTotals = {
  totalRows: number;
  totalSalesCells: number;
  validEntries: number;
  invalidEntries: number;
  inserts: number;
  updates: number;
  noChange: number;
  skippedBlanks: number;
  skippedDash: number;
  warningCount: number;
  unmappedEmployees: string[];
};

export type YearlySalesApplyWrite = {
  dateKey: string;
  dateIso: string;
  userId: string;
  empId: string;
  employeeName: string;
  amount: number;
  action: 'INSERT' | 'UPDATE';
  existingSalesEntryId: string | null;
  amountBefore: number | null;
  sourceBefore: string | null;
  stableKey: string;
};

export type YearlySalesApplyPlan = {
  boutiqueId: string;
  fileName: string;
  fileSha256: string;
  year: string | null;
  monthRange: { from: string; to: string } | null;
  writes: YearlySalesApplyWrite[];
};

export type YearlyImportDryRunResult = {
  previewRows: YearlyImportPreviewRow[];
  previewTotals: YearlyImportPreviewTotals;
  applyPlan: YearlySalesApplyPlan;
  parseErrors: { row: number; colHeader: string; reason: string }[];
  boutiqueMismatch: string | null;
  canApply: boolean;
  applyBlockReasons: string[];
};

function previewStatus(action: YearlyImportRowAction, reason: string | null): string {
  if (action === 'INSERT') return 'Will insert';
  if (action === 'UPDATE') return 'Will update';
  if (action === 'NO_CHANGE') return reason ?? 'No change';
  if (action === 'SKIPPED') return reason ?? 'Skipped';
  return reason ?? 'Error';
}

function monthRangeFromDateKeys(dateKeys: string[]): { from: string; to: string } | null {
  if (dateKeys.length === 0) return null;
  const sorted = [...dateKeys].sort();
  return { from: sorted[0]!, to: sorted[sorted.length - 1]! };
}

type QueueItem = {
  rowNumber: number;
  date: Date;
  dateKey: string;
  empId: string;
  amountSar: number;
};

export async function buildYearlyEmployeeSalesImportPlan(input: {
  buffer: Buffer;
  boutiqueId: string;
  fileName: string;
}): Promise<YearlyImportDryRunResult> {
  const fileSha256 = createHash('sha256').update(input.buffer).digest('hex');
  const readme = parseYearlyImportReadme(input.buffer);

  const uploadedBoutique = await prisma.boutique.findUnique({
    where: { id: input.boutiqueId },
    select: { id: true, name: true },
  });

  let boutiqueMismatch: string | null = null;
  if (readme.boutiqueId && readme.boutiqueId !== input.boutiqueId) {
    boutiqueMismatch = `File boutiqueId (${readme.boutiqueId}) does not match current operational boutique`;
  }

  const parseResult = parseYearlyImportExcel(input.buffer);
  if (!parseResult.ok) {
    return emptyDryRun({
      boutiqueId: input.boutiqueId,
      fileName: input.fileName,
      fileSha256,
      year: readme.year,
      error: parseResult.error,
      boutiqueMismatch,
      uploadedBoutiqueName: uploadedBoutique?.name ?? null,
    });
  }

  const parseErrors = parseResult.errors.map((e) => ({
    row: e.row,
    colHeader: e.colHeader,
    reason: e.reason,
  }));

  const empIdsFromSheet = Array.from(new Set(parseResult.employeeColumns.map((c) => c.empId)));
  const employeesRaw = await prisma.employee.findMany({
    where: { empId: { in: empIdsFromSheet } },
    select: {
      empId: true,
      name: true,
      boutiqueId: true,
      isSystemOnly: true,
      user: { select: { id: true } },
      boutique: { select: { id: true, name: true } },
    },
  });
  const employees = filterOperationalEmployees(employeesRaw);
  const empById = new Map(
    employees.map((e) => [
      e.empId,
      {
        userId: e.user?.id ?? null,
        name: e.name ?? e.empId,
        currentBoutiqueId: e.boutiqueId,
        currentBoutiqueName: e.boutique?.name ?? null,
      },
    ])
  );
  const knownEmpIds = new Set(employees.map((e) => e.empId));
  const unmappedEmployees = empIdsFromSheet.filter((id) => !knownEmpIds.has(id));

  const queue: QueueItem[] = [];
  const allDateKeys: string[] = [];
  const seenInFile = new Set<string>();

  for (let ri = 0; ri < parseResult.rows.length; ri++) {
    const row = parseResult.rows[ri]!;
    allDateKeys.push(row.dateKey);
    for (const v of row.values) {
      queue.push({
        rowNumber: ri + 2,
        date: row.date,
        dateKey: row.dateKey,
        empId: v.empId,
        amountSar: v.amountSar,
      });
    }
  }

  const userIds = queue
    .map((q) => empById.get(q.empId)?.userId)
    .filter((id): id is string => !!id);

  const [existingEntries, crossBoutiqueEntries] = await Promise.all([
    queue.length > 0
      ? prisma.salesEntry.findMany({
          where: {
            boutiqueId: input.boutiqueId,
            userId: { in: Array.from(new Set(userIds)) },
            dateKey: { in: Array.from(new Set(allDateKeys)) },
          },
          select: { id: true, userId: true, dateKey: true, amount: true, source: true },
        })
      : Promise.resolve([]),
    userIds.length > 0 && allDateKeys.length > 0
      ? prisma.salesEntry.findMany({
          where: {
            userId: { in: Array.from(new Set(userIds)) },
            dateKey: { in: Array.from(new Set(allDateKeys)) },
            boutiqueId: { not: input.boutiqueId },
          },
          select: { userId: true, dateKey: true, boutiqueId: true },
        })
      : Promise.resolve([]),
  ]);

  const existingByKey = new Map(
    existingEntries.map((e) => [`${e.dateKey}|${e.userId}`, e])
  );
  const otherBoutiqueByUserDate = new Map(
    crossBoutiqueEntries.map((e) => [`${e.dateKey}|${e.userId}`, e.boutiqueId])
  );

  const previewRows: YearlyImportPreviewRow[] = [];
  const writes: YearlySalesApplyWrite[] = [];
  let inserts = 0;
  let updates = 0;
  let noChange = 0;
  let invalidEntries = parseErrors.length;
  let warningCount = 0;

  const assignmentCache = new Map<string, Awaited<ReturnType<typeof resolveEmployeeAssignmentAtDate>>>();

  for (const item of queue) {
    const fileKey = `${item.dateKey}|${item.empId}`;
    if (seenInFile.has(fileKey)) {
      invalidEntries += 1;
      previewRows.push(
        basePreviewRow(item, input.boutiqueId, uploadedBoutique?.name ?? null, empById, {
          action: 'ERROR',
          reason: 'Duplicate employee/date in file',
          warnings: ['Duplicate employee/date in file'],
        })
      );
      continue;
    }
    seenInFile.add(fileKey);

    const mapped = empById.get(item.empId);
    if (!mapped?.userId) {
      invalidEntries += 1;
      previewRows.push(
        basePreviewRow(item, input.boutiqueId, uploadedBoutique?.name ?? null, empById, {
          action: 'ERROR',
          reason: unmappedEmployees.includes(item.empId)
            ? 'Employee not found'
            : 'Employee has no user account',
          warnings: [],
        })
      );
      continue;
    }

    const assignKey = `${item.empId}|${item.dateKey}`;
    let assignment = assignmentCache.get(assignKey);
    if (!assignment) {
      assignment = await resolveEmployeeAssignmentAtDate(item.empId, item.dateKey);
      assignmentCache.set(assignKey, assignment);
    }

    const warnings = buildAssignmentWarnings({
      uploadedBoutiqueId: input.boutiqueId,
      assignment,
      currentBoutiqueId: mapped.currentBoutiqueId,
      assignmentSource: assignment.source,
    });

    if (otherBoutiqueByUserDate.has(`${item.dateKey}|${mapped.userId}`)) {
      warnings.push(
        'Employee already has sales under another boutique on this date; imported sale stays under uploaded boutique.'
      );
    }

    if (warnings.length > 0) warningCount += warnings.length;

    const existing = existingByKey.get(`${item.dateKey}|${mapped.userId}`);
    let action: YearlyImportRowAction;
    let reason: string | null = null;

    if (!existing) {
      action = 'INSERT';
      inserts += 1;
    } else if (existing.amount === item.amountSar) {
      action = 'NO_CHANGE';
      reason = 'Amount unchanged';
      noChange += 1;
    } else {
      action = 'UPDATE';
      updates += 1;
    }

    previewRows.push({
      rowNumber: item.rowNumber,
      saleDate: item.dateKey,
      empId: item.empId,
      employeeName: mapped.name,
      amount: item.amountSar,
      uploadedBoutiqueId: input.boutiqueId,
      uploadedBoutiqueName: uploadedBoutique?.name ?? null,
      historicalBoutiqueId: assignment.historicalBoutiqueId,
      historicalBoutiqueName: assignment.historicalBoutiqueName,
      currentBoutiqueId: mapped.currentBoutiqueId,
      currentBoutiqueName: mapped.currentBoutiqueName,
      currentAmount: existing?.amount ?? null,
      newAmount: item.amountSar,
      action,
      warnings,
      reason,
      status: previewStatus(action, reason),
    });

    if (action === 'INSERT' || action === 'UPDATE') {
      writes.push({
        dateKey: item.dateKey,
        dateIso: item.date.toISOString(),
        userId: mapped.userId,
        empId: item.empId,
        employeeName: mapped.name,
        amount: item.amountSar,
        action,
        existingSalesEntryId: existing?.id ?? null,
        amountBefore: existing?.amount ?? null,
        sourceBefore: existing?.source ?? null,
        stableKey: salesEntryImportStableKey(input.boutiqueId, item.dateKey, mapped.userId),
      });
    }
  }

  const applyBlockReasons: string[] = [];
  if (boutiqueMismatch) applyBlockReasons.push(boutiqueMismatch);
  if (parseErrors.length > 0) {
    applyBlockReasons.push(`${parseErrors.length} invalid amount cell(s) in file`);
  }
  if (writes.length === 0) {
    applyBlockReasons.push('No rows to insert or update');
  }

  return {
    previewRows,
    previewTotals: {
      totalRows: parseResult.rows.length,
      totalSalesCells: queue.length + parseResult.skippedEmpty + parseResult.skippedDash,
      validEntries: previewRows.filter((r) => r.action !== 'ERROR').length,
      invalidEntries,
      inserts,
      updates,
      noChange,
      skippedBlanks: parseResult.skippedEmpty,
      skippedDash: parseResult.skippedDash,
      warningCount,
      unmappedEmployees,
    },
    applyPlan: {
      boutiqueId: input.boutiqueId,
      fileName: input.fileName,
      fileSha256,
      year: readme.year,
      monthRange: monthRangeFromDateKeys(allDateKeys),
      writes,
    },
    parseErrors,
    boutiqueMismatch,
    canApply: !boutiqueMismatch && parseErrors.length === 0 && writes.length > 0,
    applyBlockReasons,
  };
}

function basePreviewRow(
  item: QueueItem,
  uploadedBoutiqueId: string,
  uploadedBoutiqueName: string | null,
  empById: Map<
    string,
    {
      userId: string | null;
      name: string;
      currentBoutiqueId: string;
      currentBoutiqueName: string | null;
    }
  >,
  opts: { action: YearlyImportRowAction; reason: string; warnings: string[] }
): YearlyImportPreviewRow {
  const mapped = empById.get(item.empId);
  return {
    rowNumber: item.rowNumber,
    saleDate: item.dateKey,
    empId: item.empId,
    employeeName: mapped?.name ?? item.empId,
    amount: item.amountSar,
    uploadedBoutiqueId,
    uploadedBoutiqueName,
    historicalBoutiqueId: null,
    historicalBoutiqueName: null,
    currentBoutiqueId: mapped?.currentBoutiqueId ?? null,
    currentBoutiqueName: mapped?.currentBoutiqueName ?? null,
    currentAmount: null,
    newAmount: item.amountSar,
    action: opts.action,
    warnings: opts.warnings,
    reason: opts.reason,
    status: previewStatus(opts.action, opts.reason),
  };
}

function emptyDryRun(input: {
  boutiqueId: string;
  fileName: string;
  fileSha256: string;
  year: string | null;
  error: string;
  boutiqueMismatch: string | null;
  uploadedBoutiqueName: string | null;
}): YearlyImportDryRunResult {
  return {
    previewRows: [],
    previewTotals: {
      totalRows: 0,
      totalSalesCells: 0,
      validEntries: 0,
      invalidEntries: 1,
      inserts: 0,
      updates: 0,
      noChange: 0,
      skippedBlanks: 0,
      skippedDash: 0,
      warningCount: 0,
      unmappedEmployees: [],
    },
    applyPlan: {
      boutiqueId: input.boutiqueId,
      fileName: input.fileName,
      fileSha256: input.fileSha256,
      year: input.year,
      monthRange: null,
      writes: [],
    },
    parseErrors: [{ row: 0, colHeader: '', reason: input.error }],
    boutiqueMismatch: input.boutiqueMismatch,
    canApply: false,
    applyBlockReasons: [input.error],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function parseYearlySalesApplyPlan(raw: unknown, boutiqueId: string): YearlySalesApplyPlan | null {
  if (!isRecord(raw)) return null;
  if (raw.boutiqueId !== boutiqueId) return null;
  if (typeof raw.fileName !== 'string' || typeof raw.fileSha256 !== 'string') return null;
  const writesRaw = raw.writes;
  if (!Array.isArray(writesRaw)) return null;

  const writes: YearlySalesApplyWrite[] = [];
  for (const w of writesRaw) {
    if (!isRecord(w)) return null;
    if (
      typeof w.dateKey !== 'string' ||
      typeof w.dateIso !== 'string' ||
      typeof w.userId !== 'string' ||
      typeof w.empId !== 'string' ||
      typeof w.amount !== 'number' ||
      (w.action !== 'INSERT' && w.action !== 'UPDATE') ||
      typeof w.stableKey !== 'string'
    ) {
      return null;
    }
    writes.push({
      dateKey: w.dateKey,
      dateIso: w.dateIso,
      userId: w.userId,
      empId: w.empId,
      employeeName: typeof w.employeeName === 'string' ? w.employeeName : w.empId,
      amount: w.amount,
      action: w.action,
      existingSalesEntryId: typeof w.existingSalesEntryId === 'string' ? w.existingSalesEntryId : null,
      amountBefore: typeof w.amountBefore === 'number' ? w.amountBefore : null,
      sourceBefore: typeof w.sourceBefore === 'string' ? w.sourceBefore : null,
      stableKey: w.stableKey,
    });
  }

  const monthRange =
    isRecord(raw.monthRange) &&
    typeof raw.monthRange.from === 'string' &&
    typeof raw.monthRange.to === 'string'
      ? { from: raw.monthRange.from, to: raw.monthRange.to }
      : null;

  return {
    boutiqueId,
    fileName: raw.fileName,
    fileSha256: raw.fileSha256,
    year: typeof raw.year === 'string' ? raw.year : null,
    monthRange,
    writes,
  };
}

export async function applyYearlyEmployeeSalesImportPlan(input: {
  plan: YearlySalesApplyPlan;
  actorUserId: string;
}): Promise<{
  batchId: string;
  inserted: number;
  updated: number;
  noChange: number;
  rejected: number;
}> {
  let inserted = 0;
  let updated = 0;
  let noChange = 0;
  let rejected = 0;
  let batchId = '';

  const monthKey =
    input.plan.monthRange?.from?.slice(0, 7) ??
    (input.plan.year ? `${input.plan.year}-01` : '0000-00');

  const writesByDate = new Map<string, YearlySalesApplyWrite[]>();
  for (const write of input.plan.writes) {
    const list = writesByDate.get(write.dateKey) ?? [];
    list.push(write);
    writesByDate.set(write.dateKey, list);
  }

  await prisma.$transaction(async (tx) => {
    const batch = await tx.salesEntryImportBatch.create({
      data: {
        source: YEARLY_IMPORT_ENTRY_SOURCE,
        fileName: input.plan.fileName,
        fileSha256: input.plan.fileSha256,
        uploadedById: input.actorUserId,
        monthKey,
        importMode: 'yearly-employee-boutique-owned',
        summaryJson: {
          year: input.plan.year,
          monthRange: input.plan.monthRange,
          boutiqueId: input.plan.boutiqueId,
          plannedWrites: input.plan.writes.length,
        } as Prisma.InputJsonValue,
      },
    });
    batchId = batch.id;

    for (const [dateKey, dayWrites] of Array.from(writesByDate.entries())) {
      const date = new Date(dayWrites[0]!.dateIso);
      let summary = await tx.boutiqueSalesSummary.findUnique({
        where: { boutiqueId_date: { boutiqueId: input.plan.boutiqueId, date } },
        include: { lines: true },
      });

      if (!summary) {
        summary = await tx.boutiqueSalesSummary.create({
          data: {
            boutiqueId: input.plan.boutiqueId,
            date,
            totalSar: 0,
            status: 'DRAFT',
            enteredById: input.actorUserId,
          },
          include: { lines: true },
        });
        await recordSalesLedgerAudit({
          boutiqueId: input.plan.boutiqueId,
          date,
          actorId: input.actorUserId,
          action: 'SUMMARY_CREATE',
          metadata: { yearlyImport: true, totalSar: 0 },
        });
      }

      if (summary.status === 'LOCKED') {
        await tx.boutiqueSalesSummary.update({
          where: { id: summary.id },
          data: { status: 'DRAFT', lockedById: null, lockedAt: null },
        });
        await recordSalesLedgerAudit({
          boutiqueId: input.plan.boutiqueId,
          date,
          actorId: input.actorUserId,
          action: 'POST_LOCK_EDIT',
          reason: 'Yearly import; auto-unlock',
          metadata: { yearlyImport: true },
        });
      }


      for (const write of dayWrites) {
        await tx.boutiqueSalesLine.upsert({
          where: {
            summaryId_employeeId: { summaryId: summary.id, employeeId: write.empId },
          },
          create: {
            summaryId: summary.id,
            employeeId: write.empId,
            amountSar: write.amount,
            source: 'YEARLY_IMPORT',
          },
          update: {
            amountSar: write.amount,
            source: 'YEARLY_IMPORT',
            updatedAt: new Date(),
          },
        });

        const lineBase = {
          batchId: batch.id,
          boutiqueId: input.plan.boutiqueId,
          dateKey: write.dateKey,
          userId: write.userId,
          stableKey: write.stableKey,
          incomingAmount: write.amount,
        };

        if (write.action === 'INSERT') {
          inserted += 1;
        } else if (write.action === 'UPDATE') {
          updated += 1;
        } else {
          noChange += 1;
        }

        await tx.salesEntryImportBatchLine.create({
          data: {
            ...lineBase,
            salesEntryId: write.existingSalesEntryId,
            action: write.action === 'INSERT' ? 'CREATED' : 'UPDATED',
            amountBefore: write.amountBefore,
            amountAfter: write.amount,
            sourceBefore: write.sourceBefore,
          },
        });
      }

      const linesAfter = await tx.boutiqueSalesLine.findMany({
        where: { summaryId: summary.id },
        select: { amountSar: true },
      });
      const linesTotalSar = linesAfter.reduce((s, l) => s + l.amountSar, 0);
      if ((summary.totalSar ?? 0) === 0) {
        await tx.boutiqueSalesSummary.update({
          where: { id: summary.id },
          data: { totalSar: linesTotalSar },
        });
      }

      await recordSalesLedgerAudit({
        boutiqueId: input.plan.boutiqueId,
        date,
        actorId: input.actorUserId,
        action: 'IMPORT_APPLY',
        metadata: { yearlyImport: true, linesCount: dayWrites.length, dateKey },
      });
    }
  });

  for (const dateKey of Array.from(writesByDate.keys())) {
    const date = new Date(writesByDate.get(dateKey)![0]!.dateIso);
    const sync = await syncDailyLedgerToSalesEntry({
      boutiqueId: input.plan.boutiqueId,
      date,
      actorUserId: input.actorUserId,
      sourceOverride: YEARLY_IMPORT_ENTRY_SOURCE,
    });
    rejected += sync.precedenceRejected ?? 0;
  }

  return { batchId, inserted, updated, noChange, rejected };
}
