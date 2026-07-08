/**
 * Yearly employee sales import — dry-run plan and apply via canonical SalesEntry.
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { parseYearlyImportExcel } from '@/lib/sales/parseYearlyImportExcel';
import { parseYearlyImportReadme } from '@/lib/sales/parseYearlyImportReadme';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { salesEntryImportStableKey } from '@/lib/sales/salesEntryImportStableKey';

export type YearlyImportRowAction = 'INSERT' | 'UPDATE' | 'NO_CHANGE' | 'ERROR';

export type YearlyImportPreviewRow = {
  rowNumber: number;
  dateKey: string;
  empId: string;
  employeeName: string;
  currentAmount: number | null;
  newAmount: number;
  action: YearlyImportRowAction;
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
  return reason ?? 'Error';
}

function monthRangeFromDateKeys(dateKeys: string[]): { from: string; to: string } | null {
  if (dateKeys.length === 0) return null;
  const sorted = [...dateKeys].sort();
  return { from: sorted[0]!, to: sorted[sorted.length - 1]! };
}

export async function buildYearlyEmployeeSalesImportPlan(input: {
  buffer: Buffer;
  boutiqueId: string;
  fileName: string;
}): Promise<YearlyImportDryRunResult> {
  const fileSha256 = createHash('sha256').update(input.buffer).digest('hex');
  const readme = parseYearlyImportReadme(input.buffer);

  let boutiqueMismatch: string | null = null;
  if (readme.boutiqueId && readme.boutiqueId !== input.boutiqueId) {
    boutiqueMismatch = `File boutiqueId (${readme.boutiqueId}) does not match current operational boutique`;
  }

  const parseResult = parseYearlyImportExcel(input.buffer);
  if (!parseResult.ok) {
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
        unmappedEmployees: [],
      },
      applyPlan: {
        boutiqueId: input.boutiqueId,
        fileName: input.fileName,
        fileSha256,
        year: readme.year,
        monthRange: null,
        writes: [],
      },
      parseErrors: [{ row: 0, colHeader: '', reason: parseResult.error }],
      boutiqueMismatch,
      canApply: false,
      applyBlockReasons: [parseResult.error],
    };
  }

  const parseErrors = parseResult.errors.map((e) => ({
    row: e.row,
    colHeader: e.colHeader,
    reason: e.reason,
  }));

  const empIdsFromSheet = Array.from(new Set(parseResult.employeeColumns.map((c) => c.empId)));
  const employeesRaw = await prisma.employee.findMany({
    where: { boutiqueId: input.boutiqueId, empId: { in: empIdsFromSheet } },
    select: { empId: true, name: true, isSystemOnly: true, user: { select: { id: true } } },
  });
  const employees = filterOperationalEmployees(employeesRaw);
  const empById = new Map(
    employees.map((e) => [
      e.empId,
      { userId: e.user?.id ?? null, name: e.name ?? e.empId },
    ])
  );
  const mappedEmpIds = new Set(employees.map((e) => e.empId));
  const unmappedEmployees = empIdsFromSheet.filter((id) => !mappedEmpIds.has(id));

  const allDateKeys: string[] = [];
  const queue: {
    rowNumber: number;
    date: Date;
    dateKey: string;
    empId: string;
    amountSar: number;
  }[] = [];

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

  const existingEntries =
    queue.length > 0
      ? await prisma.salesEntry.findMany({
          where: {
            boutiqueId: input.boutiqueId,
            userId: { in: Array.from(new Set(userIds)) },
            dateKey: { in: Array.from(new Set(allDateKeys)) },
          },
          select: { id: true, userId: true, dateKey: true, amount: true, source: true },
        })
      : [];

  const existingByKey = new Map(
    existingEntries.map((e) => [`${e.dateKey}|${e.userId}`, e])
  );

  const previewRows: YearlyImportPreviewRow[] = [];
  const writes: YearlySalesApplyWrite[] = [];
  let inserts = 0;
  let updates = 0;
  let noChange = 0;
  let invalidEntries = parseErrors.length;

  for (const item of queue) {
    const mapped = empById.get(item.empId);
    const employeeName = mapped?.name ?? item.empId;

    if (!mapped?.userId) {
      invalidEntries += 1;
      previewRows.push({
        rowNumber: item.rowNumber,
        dateKey: item.dateKey,
        empId: item.empId,
        employeeName,
        currentAmount: null,
        newAmount: item.amountSar,
        action: 'ERROR',
        reason: unmappedEmployees.includes(item.empId)
          ? 'Employee not in current boutique'
          : 'Employee has no user account',
        status: 'Employee not in current boutique',
      });
      continue;
    }

    const existing = existingByKey.get(`${item.dateKey}|${mapped.userId}`);
    let action: YearlyImportRowAction;
    let reason: string | null = null;

    if (!existing) {
      action = 'INSERT';
      reason = null;
      inserts += 1;
    } else if (existing.amount === item.amountSar) {
      action = 'NO_CHANGE';
      reason = 'Amount unchanged';
      noChange += 1;
    } else {
      action = 'UPDATE';
      updates += 1;
    }

    const status = previewStatus(action, reason);
    previewRows.push({
      rowNumber: item.rowNumber,
      dateKey: item.dateKey,
      empId: item.empId,
      employeeName,
      currentAmount: existing?.amount ?? null,
      newAmount: item.amountSar,
      action,
      reason,
      status,
    });

    if (action === 'INSERT' || action === 'UPDATE') {
      writes.push({
        dateKey: item.dateKey,
        dateIso: item.date.toISOString(),
        userId: mapped.userId,
        empId: item.empId,
        employeeName,
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

  const monthRange = monthRangeFromDateKeys(allDateKeys);

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
      unmappedEmployees,
    },
    applyPlan: {
      boutiqueId: input.boutiqueId,
      fileName: input.fileName,
      fileSha256,
      year: readme.year,
      monthRange,
      writes,
    },
    parseErrors,
    boutiqueMismatch,
    canApply: !boutiqueMismatch && parseErrors.length === 0 && writes.length > 0,
    applyBlockReasons,
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
    input.plan.year ? `${input.plan.year}-01` : null;

  await prisma.$transaction(async (tx) => {
    const batch = await tx.salesEntryImportBatch.create({
      data: {
        source: SALES_ENTRY_SOURCE.EXCEL_YEARLY_IMPORT,
        fileName: input.plan.fileName,
        fileSha256: input.plan.fileSha256,
        uploadedById: input.actorUserId,
        monthKey: monthKey ?? '0000-00',
        importMode: 'yearly-employee',
        summaryJson: {
          year: input.plan.year,
          monthRange: input.plan.monthRange,
          boutiqueId: input.plan.boutiqueId,
          plannedWrites: input.plan.writes.length,
        } as Prisma.InputJsonValue,
      },
    });
    batchId = batch.id;

    for (const write of input.plan.writes) {
      const res = await upsertCanonicalSalesEntry({
        kind: 'direct',
        boutiqueId: input.plan.boutiqueId,
        userId: write.userId,
        amount: write.amount,
        source: SALES_ENTRY_SOURCE.EXCEL_YEARLY_IMPORT,
        actorUserId: input.actorUserId,
        date: new Date(write.dateIso),
        allowLockedOverride: true,
        tx,
        entryImportBatchId: batch.id,
      });

      const lineBase = {
        batchId: batch.id,
        boutiqueId: input.plan.boutiqueId,
        dateKey: write.dateKey,
        userId: write.userId,
        stableKey: write.stableKey,
        incomingAmount: write.amount,
      };

      if (res.status === 'created') {
        inserted += 1;
        await tx.salesEntryImportBatchLine.create({
          data: {
            ...lineBase,
            salesEntryId: res.salesEntryId,
            action: 'CREATED',
            amountBefore: null,
            amountAfter: write.amount,
            sourceBefore: null,
          },
        });
      } else if (res.status === 'updated') {
        updated += 1;
        await tx.salesEntryImportBatchLine.create({
          data: {
            ...lineBase,
            salesEntryId: res.salesEntryId,
            action: 'UPDATED',
            amountBefore: write.amountBefore,
            amountAfter: write.amount,
            sourceBefore: write.sourceBefore,
          },
        });
      } else if (res.status === 'no_change') {
        noChange += 1;
        await tx.salesEntryImportBatchLine.create({
          data: {
            ...lineBase,
            salesEntryId: res.salesEntryId,
            action: 'NO_CHANGE',
            amountBefore: write.amountBefore,
            amountAfter: write.amount,
            sourceBefore: write.sourceBefore,
          },
        });
      } else {
        rejected += 1;
        await tx.salesEntryImportBatchLine.create({
          data: {
            ...lineBase,
            salesEntryId: write.existingSalesEntryId,
            action:
              res.status === 'rejected_locked'
                ? 'REJECTED_LOCK'
                : res.status === 'rejected_precedence'
                  ? 'REJECTED_PRECEDENCE'
                  : 'REJECTED_INVALID',
            amountBefore: write.amountBefore,
            amountAfter: null,
            sourceBefore: write.sourceBefore,
          },
        });
      }
    }
  });

  return { batchId, inserted, updated, noChange, rejected };
}
