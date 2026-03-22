/**
 * Admin historical SalesEntry imports: initial (insert-if-empty) and correction (update existing, MANUAL excluded).
 * Writes only through upsertCanonicalSalesEntry — no parallel ledger writes (see docs/historical-sales-import.md).
 */

import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { formatMonthKey, normalizeDateOnlyRiyadh } from '@/lib/time';
import { parseYearlyImportExcel } from '@/lib/sales/parseYearlyImportExcel';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { logAudit } from '@/lib/audit';
import {
  isDateKeyAllowedForHistoricalCorrection,
  isDateKeyAllowedForHistoricalInitial,
} from '@/lib/historical-sales-import/historicalDatePolicy';
import { isCorrectableSalesEntrySource } from '@/lib/historical-sales-import/correctableSources';
import { rowsToCsv } from '@/lib/historical-sales-import/reportCsv';

export type ImportIssue = {
  rowIndex: number;
  dateKey: string;
  empId: string;
  severity: 'BLOCK' | 'WARN';
  code: string;
  message: string;
};

export type HistoricalInitialSummary = {
  mode: 'historical_initial';
  dryRun: boolean;
  boutiqueId: string;
  totalRowsInFile: number;
  queuedCells: number;
  inserted: number;
  skippedEmpty: number;
  skippedDash: number;
  rejectedExistsInDb: number;
  rejectedLocked: number;
  rejectedPrecedence: number;
  rejectedInvalid: number;
  duplicateInFile: number;
  unmappedEmpIds: string[];
  rejectedNotHistoricalPeriod: number;
  warnings: number;
  issues: ImportIssue[];
  conflictReportCsv: string;
};

export type HistoricalCorrectionSummary = {
  mode: 'historical_correction';
  dryRun: boolean;
  boutiqueId: string;
  reason: string;
  totalRowsInFile: number;
  queuedCells: number;
  updated: number;
  noChange: number;
  rejectedMissingTarget: number;
  rejectedNotCorrectableManual: number;
  rejectedLocked: number;
  rejectedInvalid: number;
  duplicateInFile: number;
  unmappedEmpIds: string[];
  rejectedNotHistoricalPeriod: number;
  warnings: number;
  issues: ImportIssue[];
  conflictReportCsv: string;
};

function pushIssue(
  issues: ImportIssue[],
  rowIndex: number,
  dateKey: string,
  empId: string,
  severity: 'BLOCK' | 'WARN',
  code: string,
  message: string
) {
  issues.push({ rowIndex, dateKey, empId, severity, code, message });
}

type QueueItem = {
  date: Date;
  dateKey: string;
  empId: string;
  amountSar: number;
  sheetRowIndex: number;
};

export async function runHistoricalInitialImport(params: {
  buffer: Buffer;
  boutiqueId: string;
  actorUserId: string;
  dryRun: boolean;
  monthFilter: string | null;
}): Promise<HistoricalInitialSummary> {
  const { buffer, boutiqueId, actorUserId, dryRun, monthFilter } = params;
  const issues: ImportIssue[] = [];

  const parseResult = parseYearlyImportExcel(buffer);
  if (!parseResult.ok) {
    return {
      mode: 'historical_initial',
      dryRun,
      boutiqueId,
      totalRowsInFile: 0,
      queuedCells: 0,
      inserted: 0,
      skippedEmpty: 0,
      skippedDash: 0,
      rejectedExistsInDb: 0,
      rejectedLocked: 0,
      rejectedPrecedence: 0,
      rejectedInvalid: 0,
      duplicateInFile: 0,
      unmappedEmpIds: [],
      rejectedNotHistoricalPeriod: 0,
      warnings: 0,
      issues: [{ rowIndex: 0, dateKey: '', empId: '', severity: 'BLOCK', code: 'PARSE', message: parseResult.error }],
      conflictReportCsv: '',
    };
  }
  if (parseResult.errors.length > 0) {
    const csv = rowsToCsv(
      ['rowIndex', 'dateKey', 'empId', 'severity', 'code', 'message'],
      parseResult.errors.slice(0, 200).map((e) => ({
        rowIndex: e.row,
        dateKey: '',
        empId: e.colHeader,
        severity: 'BLOCK',
        code: 'INVALID_AMOUNT',
        message: e.reason,
      }))
    );
    return {
      mode: 'historical_initial',
      dryRun,
      boutiqueId,
      totalRowsInFile: 0,
      queuedCells: 0,
      inserted: 0,
      skippedEmpty: parseResult.skippedEmpty,
      skippedDash: parseResult.skippedDash,
      rejectedExistsInDb: 0,
      rejectedLocked: 0,
      rejectedPrecedence: 0,
      rejectedInvalid: parseResult.errors.length,
      duplicateInFile: 0,
      unmappedEmpIds: [],
      rejectedNotHistoricalPeriod: 0,
      warnings: 0,
      issues: [],
      conflictReportCsv: csv,
    };
  }

  const { employeeColumns, rows, skippedEmpty, skippedDash } = parseResult;
  const empIdsFromSheet = Array.from(new Set(employeeColumns.map((c) => c.empId)));

  const employeesInBoutiqueRaw = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: empIdsFromSheet } },
    select: { empId: true, isSystemOnly: true },
  });
  const employeesInBoutique = filterOperationalEmployees(employeesInBoutiqueRaw);
  const mappedEmpIds = new Set(employeesInBoutique.map((e) => e.empId));
  const unmappedEmpIds = empIdsFromSheet.filter((id) => !mappedEmpIds.has(id));

  const users = await prisma.user.findMany({
    where: { empId: { in: Array.from(mappedEmpIds) } },
    select: { id: true, empId: true },
  });
  const userIdByEmpId = new Map(users.map((u) => [u.empId, u.id]));

  const monthFilterNorm = monthFilter?.trim()
    ? monthFilter.trim().replace(/\//g, '-').slice(0, 7)
    : null;
  if (monthFilter && !/^\d{4}-\d{2}$/.test(monthFilterNorm ?? '')) {
    pushIssue(issues, 0, '', '', 'BLOCK', 'BAD_MONTH_FILTER', 'month filter must be YYYY-MM');
  }

  const queue: QueueItem[] = [];
  const seenKey = new Map<string, QueueItem>();

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (monthFilterNorm && formatMonthKey(row.date) !== monthFilterNorm) continue;
    const sheetRowIndex = ri + 2;
    for (const v of row.values) {
      if (!mappedEmpIds.has(v.empId)) continue;
      const key = `${row.dateKey}|${v.empId}`;
      const prev = seenKey.get(key);
      if (prev) {
        if (prev.amountSar !== v.amountSar) {
          pushIssue(
            issues,
            sheetRowIndex,
            row.dateKey,
            v.empId,
            'BLOCK',
            'DUPLICATE_IN_FILE',
            `Duplicate date+employee with conflicting amounts (first row ~${prev.sheetRowIndex})`
          );
        }
        continue;
      }
      const item: QueueItem = {
        date: row.date,
        dateKey: row.dateKey,
        empId: v.empId,
        amountSar: v.amountSar,
        sheetRowIndex,
      };
      seenKey.set(key, item);
      queue.push(item);
    }
  }

  const duplicateInFile = issues.filter((i) => i.code === 'DUPLICATE_IN_FILE').length;

  let inserted = 0;
  let rejectedExistsInDb = 0;
  let rejectedLocked = 0;
  let rejectedPrecedence = 0;
  let rejectedInvalid = 0;
  let rejectedNotHistoricalPeriod = 0;

  for (const item of queue) {
    if (!isDateKeyAllowedForHistoricalInitial(item.dateKey)) {
      rejectedNotHistoricalPeriod += 1;
      pushIssue(
        issues,
        item.sheetRowIndex,
        item.dateKey,
        item.empId,
        'BLOCK',
        'NOT_HISTORICAL_PERIOD',
        'Date must be in a past closed month (before current month, Asia/Riyadh)'
      );
      continue;
    }

    const userId = userIdByEmpId.get(item.empId);
    if (!userId) {
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'NO_USER', 'No User for empId');
      continue;
    }

    const existing = await prisma.salesEntry.findUnique({
      where: { boutiqueId_dateKey_userId: { boutiqueId, dateKey: item.dateKey, userId } },
      select: { id: true, amount: true, source: true },
    });

    if (existing) {
      rejectedExistsInDb += 1;
      pushIssue(
        issues,
        item.sheetRowIndex,
        item.dateKey,
        item.empId,
        'BLOCK',
        'EXISTS_IN_DB',
        `SalesEntry already exists (source=${existing.source ?? 'null'}); initial import does not overwrite`
      );
      continue;
    }

    if (dryRun) {
      inserted += 1;
      continue;
    }

    const res = await upsertCanonicalSalesEntry({
      kind: 'direct',
      boutiqueId,
      userId,
      amount: item.amountSar,
      source: SALES_ENTRY_SOURCE.HISTORICAL_IMPORT,
      actorUserId,
      date: normalizeDateOnlyRiyadh(item.dateKey),
      respectLedgerLock: true,
      allowLockedOverride: true,
    });

    if (res.status === 'rejected_locked') {
      rejectedLocked += 1;
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'LOCKED', 'Day locked');
    } else if (res.status === 'rejected_precedence') {
      rejectedPrecedence += 1;
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'PRECEDENCE', 'Precedence blocked');
    } else if (res.status === 'rejected_invalid') {
      rejectedInvalid += 1;
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'INVALID', res.reason);
    } else if (res.status === 'created') {
      inserted += 1;
    } else {
      rejectedInvalid += 1;
    }
  }

  const warnings = issues.filter((i) => i.severity === 'WARN').length;
  const conflictReportCsv = rowsToCsv(
    ['rowIndex', 'dateKey', 'empId', 'severity', 'code', 'message'],
    issues.map((i) => ({
      rowIndex: i.rowIndex,
      dateKey: i.dateKey,
      empId: i.empId,
      severity: i.severity,
      code: i.code,
      message: i.message,
    }))
  );

  return {
    mode: 'historical_initial',
    dryRun,
    boutiqueId,
    totalRowsInFile: rows.length,
    queuedCells: queue.length,
    inserted,
    skippedEmpty,
    skippedDash,
    rejectedExistsInDb,
    rejectedLocked,
    rejectedPrecedence,
    rejectedInvalid,
    duplicateInFile,
    unmappedEmpIds,
    rejectedNotHistoricalPeriod,
    warnings,
    issues,
    conflictReportCsv,
  };
}

export async function runHistoricalCorrectionImport(params: {
  buffer: Buffer;
  boutiqueId: string;
  actorUserId: string;
  dryRun: boolean;
  monthFilter: string | null;
  reason: string;
}): Promise<HistoricalCorrectionSummary> {
  const { buffer, boutiqueId, actorUserId, dryRun, monthFilter, reason } = params;
  const issues: ImportIssue[] = [];
  const reasonTrim = reason.trim();
  if (reasonTrim.length < 8) {
    return {
      mode: 'historical_correction',
      dryRun,
      boutiqueId,
      reason: reasonTrim,
      totalRowsInFile: 0,
      queuedCells: 0,
      updated: 0,
      noChange: 0,
      rejectedMissingTarget: 0,
      rejectedNotCorrectableManual: 0,
      rejectedLocked: 0,
      rejectedInvalid: 0,
      duplicateInFile: 0,
      unmappedEmpIds: [],
      rejectedNotHistoricalPeriod: 0,
      warnings: 0,
      issues: [
        {
          rowIndex: 0,
          dateKey: '',
          empId: '',
          severity: 'BLOCK',
          code: 'REASON_REQUIRED',
          message: 'Correction reason is mandatory (min 8 characters)',
        },
      ],
      conflictReportCsv: '',
    };
  }

  const parseResult = parseYearlyImportExcel(buffer);
  if (!parseResult.ok) {
    return {
      mode: 'historical_correction',
      dryRun,
      boutiqueId,
      reason: reasonTrim,
      totalRowsInFile: 0,
      queuedCells: 0,
      updated: 0,
      noChange: 0,
      rejectedMissingTarget: 0,
      rejectedNotCorrectableManual: 0,
      rejectedLocked: 0,
      rejectedInvalid: 0,
      duplicateInFile: 0,
      unmappedEmpIds: [],
      rejectedNotHistoricalPeriod: 0,
      warnings: 0,
      issues: [{ rowIndex: 0, dateKey: '', empId: '', severity: 'BLOCK', code: 'PARSE', message: parseResult.error }],
      conflictReportCsv: '',
    };
  }
  if (parseResult.errors.length > 0) {
    const csv = rowsToCsv(
      ['rowIndex', 'dateKey', 'empId', 'severity', 'code', 'message'],
      parseResult.errors.slice(0, 200).map((e) => ({
        rowIndex: e.row,
        dateKey: '',
        empId: e.colHeader,
        severity: 'BLOCK',
        code: 'INVALID_AMOUNT',
        message: e.reason,
      }))
    );
    return {
      mode: 'historical_correction',
      dryRun,
      boutiqueId,
      reason: reasonTrim,
      totalRowsInFile: 0,
      queuedCells: 0,
      updated: 0,
      noChange: 0,
      rejectedMissingTarget: 0,
      rejectedNotCorrectableManual: 0,
      rejectedLocked: 0,
      rejectedInvalid: parseResult.errors.length,
      duplicateInFile: 0,
      unmappedEmpIds: [],
      rejectedNotHistoricalPeriod: 0,
      warnings: 0,
      issues: [],
      conflictReportCsv: csv,
    };
  }

  const { employeeColumns, rows } = parseResult;
  const empIdsFromSheet = Array.from(new Set(employeeColumns.map((c) => c.empId)));

  const employeesInBoutiqueRaw = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: empIdsFromSheet } },
    select: { empId: true, isSystemOnly: true },
  });
  const employeesInBoutique = filterOperationalEmployees(employeesInBoutiqueRaw);
  const mappedEmpIds = new Set(employeesInBoutique.map((e) => e.empId));
  const unmappedEmpIds = empIdsFromSheet.filter((id) => !mappedEmpIds.has(id));

  const users = await prisma.user.findMany({
    where: { empId: { in: Array.from(mappedEmpIds) } },
    select: { id: true, empId: true },
  });
  const userIdByEmpId = new Map(users.map((u) => [u.empId, u.id]));

  const monthFilterNorm = monthFilter?.trim()
    ? monthFilter.trim().replace(/\//g, '-').slice(0, 7)
    : null;

  const queue: QueueItem[] = [];
  const seenKey = new Map<string, QueueItem>();

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (monthFilterNorm && formatMonthKey(row.date) !== monthFilterNorm) continue;
    const sheetRowIndex = ri + 2;
    for (const v of row.values) {
      if (!mappedEmpIds.has(v.empId)) continue;
      const key = `${row.dateKey}|${v.empId}`;
      const prev = seenKey.get(key);
      if (prev) {
        if (prev.amountSar !== v.amountSar) {
          pushIssue(
            issues,
            sheetRowIndex,
            row.dateKey,
            v.empId,
            'BLOCK',
            'DUPLICATE_IN_FILE',
            `Duplicate date+employee with conflicting amounts`
          );
        }
        continue;
      }
      const item: QueueItem = {
        date: row.date,
        dateKey: row.dateKey,
        empId: v.empId,
        amountSar: v.amountSar,
        sheetRowIndex,
      };
      seenKey.set(key, item);
      queue.push(item);
    }
  }

  let updated = 0;
  let noChange = 0;
  let rejectedMissingTarget = 0;
  let rejectedNotCorrectableManual = 0;
  let rejectedLocked = 0;
  let rejectedInvalid = 0;
  let rejectedNotHistoricalPeriod = 0;

  for (const item of queue) {
    if (!isDateKeyAllowedForHistoricalCorrection(item.dateKey)) {
      rejectedNotHistoricalPeriod += 1;
      pushIssue(
        issues,
        item.sheetRowIndex,
        item.dateKey,
        item.empId,
        'BLOCK',
        'NOT_HISTORICAL_PERIOD',
        'Date must be in a past closed month (Asia/Riyadh)'
      );
      continue;
    }

    const userId = userIdByEmpId.get(item.empId);
    if (!userId) {
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'NO_USER', 'No User for empId');
      continue;
    }

    const existing = await prisma.salesEntry.findUnique({
      where: { boutiqueId_dateKey_userId: { boutiqueId, dateKey: item.dateKey, userId } },
      select: { id: true, amount: true, source: true },
    });

    if (!existing) {
      rejectedMissingTarget += 1;
      pushIssue(
        issues,
        item.sheetRowIndex,
        item.dateKey,
        item.empId,
        'BLOCK',
        'MISSING_TARGET',
        'No SalesEntry row to correct; use historical initial import first'
      );
      continue;
    }

    if (!isCorrectableSalesEntrySource(existing.source)) {
      rejectedNotCorrectableManual += 1;
      pushIssue(
        issues,
        item.sheetRowIndex,
        item.dateKey,
        item.empId,
        'BLOCK',
        'NOT_CORRECTABLE_MANUAL',
        'Row is MANUAL; correction import cannot change it'
      );
      continue;
    }

    if (dryRun) {
      if (existing.amount === item.amountSar) noChange += 1;
      else updated += 1;
      continue;
    }

    const res = await upsertCanonicalSalesEntry({
      kind: 'direct',
      boutiqueId,
      userId,
      amount: item.amountSar,
      source: SALES_ENTRY_SOURCE.HISTORICAL_CORRECTION,
      actorUserId,
      date: normalizeDateOnlyRiyadh(item.dateKey),
      respectLedgerLock: true,
      allowLockedOverride: true,
      forceAdminOverride: true,
    });

    if (res.status === 'rejected_locked') {
      rejectedLocked += 1;
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'LOCKED', 'Day locked');
    } else if (res.status === 'rejected_invalid') {
      rejectedInvalid += 1;
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'INVALID', res.reason);
    } else if (res.status === 'updated') {
      updated += 1;
    } else if (res.status === 'no_change') {
      noChange += 1;
    } else if (res.status === 'created') {
      rejectedInvalid += 1;
      pushIssue(issues, item.sheetRowIndex, item.dateKey, item.empId, 'BLOCK', 'UNEXPECTED_CREATE', 'Unexpected create');
    } else {
      rejectedInvalid += 1;
    }
  }

  if (!dryRun && updated > 0) {
    await logAudit(actorUserId, 'HISTORICAL_SALES_CORRECTION', 'Boutique', boutiqueId, null, null, reasonTrim, {
      boutiqueId,
    });
  }

  const duplicateInFile = issues.filter((i) => i.code === 'DUPLICATE_IN_FILE').length;
  const warnings = issues.filter((i) => i.severity === 'WARN').length;
  const conflictReportCsv = rowsToCsv(
    ['rowIndex', 'dateKey', 'empId', 'severity', 'code', 'message'],
    issues.map((i) => ({
      rowIndex: i.rowIndex,
      dateKey: i.dateKey,
      empId: i.empId,
      severity: i.severity,
      code: i.code,
      message: i.message,
    }))
  );

  return {
    mode: 'historical_correction',
    dryRun,
    boutiqueId,
    reason: reasonTrim,
    totalRowsInFile: rows.length,
    queuedCells: queue.length,
    updated,
    noChange,
    rejectedMissingTarget,
    rejectedNotCorrectableManual,
    rejectedLocked,
    rejectedInvalid,
    duplicateInFile,
    unmappedEmpIds,
    rejectedNotHistoricalPeriod,
    warnings,
    issues,
    conflictReportCsv,
  };
}
