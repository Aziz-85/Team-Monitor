/**
 * Boutique targets import: parse, validate, preview, apply.
 * Strict: required sheet, header names, YYYY-MM, integer target, no duplicates.
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import {
  computePreviewTotals,
  previewStatusLabel,
  resolveTargetWriteAction,
  type ImportPreviewTotals,
  type ImportRowAction,
} from './importPreview';
import { parseTargetValue } from './parseTargetValue';
import { readRowsByHeaders } from './spreadsheetRows';
import {
  buildTargetImportDebug,
  logTargetImportError,
  type TargetImportRowDebug,
} from './targetImportDebug';
import { BOUTIQUE_SHEET, BOUTIQUE_HEADERS } from './templates';

export type BoutiqueTargetRow = {
  month: string;
  scopeId: string;
  boutiqueName: string;
  target: number;
  source: string;
  notes: string;
};

export type BoutiqueRowError = {
  rowIndex: number;
  message: string;
  row?: BoutiqueTargetRow;
  debug?: TargetImportRowDebug;
};

export type BoutiqueImportPreviewRow = {
  rowNumber: number;
  month: string;
  boutiqueId: string | null;
  boutiqueCode: string;
  boutiqueName: string;
  targetAmount: number | null;
  action: ImportRowAction;
  existingAmount: number | null;
  newAmount: number | null;
  reason: string | null;
  status: string;
};

export type BoutiquePreviewResult = {
  totalRows: number;
  validRows: BoutiqueTargetRow[];
  invalidRows: BoutiqueRowError[];
  duplicateKeys: string[];
  inserts: {
    month: string;
    boutiqueId: string;
    boutiqueName: string;
    target: number;
    source: string;
    notes: string;
  }[];
  updates: {
    month: string;
    boutiqueId: string;
    boutiqueName: string;
    target: number;
    source: string;
    notes: string;
    existingId: string;
  }[];
  unresolvedBoutiques: string[];
  monthFormatErrors: number;
  targetFormatErrors: number;
  previewRows: BoutiqueImportPreviewRow[];
  previewTotals: ImportPreviewTotals;
};

const MONTH_REGEX = /^\d{4}-\d{2}$/;

function trim(s: unknown): string {
  if (s == null) return '';
  return String(s).trim();
}

function emptyPreview(overrides: Partial<BoutiquePreviewResult> = {}): BoutiquePreviewResult {
  return {
    totalRows: 0,
    validRows: [],
    invalidRows: [],
    duplicateKeys: [],
    inserts: [],
    updates: [],
    unresolvedBoutiques: [],
    monthFormatErrors: 0,
    targetFormatErrors: 0,
    previewRows: [],
    previewTotals: computePreviewTotals([]),
    ...overrides,
  };
}

function previewRowBase(
  rowNumber: number,
  month: string,
  boutiqueCode: string,
  boutiqueName: string
): Omit<BoutiqueImportPreviewRow, 'action' | 'reason' | 'status'> {
  return {
    rowNumber,
    month,
    boutiqueId: null,
    boutiqueCode,
    boutiqueName,
    targetAmount: null,
    existingAmount: null,
    newAmount: null,
  };
}

function finalizePreviewRow(
  row: Omit<BoutiqueImportPreviewRow, 'status'>,
  action: ImportRowAction,
  reason: string | null
): BoutiqueImportPreviewRow {
  return {
    ...row,
    action,
    reason,
    status: previewStatusLabel(action, reason),
  };
}

/** Parse workbook and validate; returns preview (no DB write). */
export async function parseAndValidateBoutiques(
  buffer: Buffer,
  allowedBoutiqueIds: string[]
): Promise<BoutiquePreviewResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    const previewRows = [
      finalizePreviewRow(
        {
          ...previewRowBase(0, '', '', ''),
          action: 'ERROR',
          reason: 'Invalid Excel file',
        },
        'ERROR',
        'Invalid Excel file'
      ),
    ];
    return emptyPreview({
      invalidRows: [{ rowIndex: 0, message: 'Invalid Excel file' }],
      previewRows,
      previewTotals: computePreviewTotals(previewRows),
    });
  }

  const sheet = workbook.Sheets[BOUTIQUE_SHEET];
  if (!sheet) {
    const previewRows = [
      finalizePreviewRow(
        {
          ...previewRowBase(0, '', '', ''),
          action: 'ERROR',
          reason: `Missing sheet: ${BOUTIQUE_SHEET}`,
        },
        'ERROR',
        `Missing sheet: ${BOUTIQUE_SHEET}`
      ),
    ];
    return emptyPreview({
      invalidRows: [{ rowIndex: 0, message: `Missing sheet: ${BOUTIQUE_SHEET}` }],
      previewRows,
      previewTotals: computePreviewTotals(previewRows),
    });
  }

  const parsedSheet = readRowsByHeaders(sheet, BOUTIQUE_HEADERS);
  if (!parsedSheet.ok) {
    const previewRows = [
      finalizePreviewRow(
        {
          ...previewRowBase(0, '', '', ''),
          action: 'ERROR',
          reason: parsedSheet.error,
        },
        'ERROR',
        parsedSheet.error
      ),
    ];
    return emptyPreview({
      invalidRows: [{ rowIndex: 0, message: parsedSheet.error }],
      previewRows,
      previewTotals: computePreviewTotals(previewRows),
    });
  }

  const { rows: dataRows, rowIndexes, detectedHeaders } = parsedSheet;

  const boutiquesByCode = await prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  });
  const codeToBoutique = new Map(boutiquesByCode.map((b) => [b.code.trim().toUpperCase(), b]));

  const monthsInSheet = Array.from(
    new Set(
      dataRows
        .map((row) => trim(row.Month))
        .filter((month) => MONTH_REGEX.test(month))
    )
  );
  const existing = await prisma.boutiqueMonthlyTarget.findMany({
    where: {
      boutiqueId: { in: allowedBoutiqueIds },
      month: { in: monthsInSheet },
    },
    select: { id: true, boutiqueId: true, month: true, amount: true },
  });
  const existingMap = new Map(existing.map((e) => [`${e.month}|${e.boutiqueId}`, e]));

  const validRows: BoutiqueTargetRow[] = [];
  const invalidRows: BoutiqueRowError[] = [];
  const previewRows: BoutiqueImportPreviewRow[] = [];
  const inserts: BoutiquePreviewResult['inserts'] = [];
  const updates: BoutiquePreviewResult['updates'] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];
  let monthFormatErrors = 0;
  let targetFormatErrors = 0;
  const unresolvedScopes: Set<string> = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowIndex = rowIndexes[i];
    const month = trim(r.Month);
    const scopeId = trim(r.ScopeId);
    const boutiqueName = trim(r.BoutiqueName);
    const targetRaw = r.Target;
    const source = trim(r.Source) || 'OFFICIAL';
    const notes = trim(r.Notes);

    const base = previewRowBase(rowIndex, month, scopeId, boutiqueName);

    if (!month) {
      invalidRows.push({ rowIndex, message: 'Month is required' });
      previewRows.push(finalizePreviewRow({ ...base, action: 'ERROR', reason: 'Month is required' }, 'ERROR', 'Month is required'));
      continue;
    }
    if (!MONTH_REGEX.test(month)) {
      monthFormatErrors++;
      invalidRows.push({
        rowIndex,
        message: 'Month must be YYYY-MM',
        row: { month, scopeId, boutiqueName, target: 0, source, notes },
      });
      previewRows.push(finalizePreviewRow({ ...base, action: 'ERROR', reason: 'Month must be YYYY-MM' }, 'ERROR', 'Month must be YYYY-MM'));
      continue;
    }
    if (!scopeId) {
      invalidRows.push({ rowIndex, message: 'ScopeId is required' });
      previewRows.push(finalizePreviewRow({ ...base, action: 'ERROR', reason: 'ScopeId is required' }, 'ERROR', 'ScopeId is required'));
      continue;
    }

    const targetResult = parseTargetValue(targetRaw);
    if (targetResult.kind === 'empty') {
      previewRows.push(
        finalizePreviewRow(
          { ...base, month, boutiqueCode: scopeId, boutiqueName, action: 'SKIPPED', reason: 'Empty target' },
          'SKIPPED',
          'Empty target'
        )
      );
      continue;
    }
    if (targetResult.kind === 'error') {
      targetFormatErrors++;
      const debug = buildTargetImportDebug(detectedHeaders, targetRaw);
      logTargetImportError('targets/import/boutiques', rowIndex, targetResult.message, debug);
      const rowError: BoutiqueRowError = {
        rowIndex,
        message: targetResult.message,
        row: { month, scopeId, boutiqueName, target: 0, source, notes },
      };
      if (process.env.NODE_ENV === 'development') rowError.debug = debug;
      invalidRows.push(rowError);
      previewRows.push(
        finalizePreviewRow(
          {
            ...base,
            month,
            boutiqueCode: scopeId,
            boutiqueName,
            targetAmount: null,
            action: 'ERROR',
            reason: targetResult.message,
          },
          'ERROR',
          targetResult.message
        )
      );
      continue;
    }

    const boutique = codeToBoutique.get(scopeId.trim().toUpperCase());
    if (!boutique) {
      unresolvedScopes.add(scopeId);
      invalidRows.push({ rowIndex, message: `ScopeId not found: ${scopeId}` });
      previewRows.push(
        finalizePreviewRow(
          {
            ...base,
            month,
            boutiqueCode: scopeId,
            boutiqueName,
            targetAmount: targetResult.value,
            newAmount: targetResult.value,
            action: 'ERROR',
            reason: `ScopeId not found: ${scopeId}`,
          },
          'ERROR',
          `ScopeId not found: ${scopeId}`
        )
      );
      continue;
    }
    if (!allowedBoutiqueIds.includes(boutique.id)) {
      invalidRows.push({ rowIndex, message: 'Boutique not in your scope' });
      previewRows.push(
        finalizePreviewRow(
          {
            ...base,
            month,
            boutiqueId: boutique.id,
            boutiqueCode: boutique.code ?? scopeId,
            boutiqueName: boutiqueName || boutique.name,
            targetAmount: targetResult.value,
            newAmount: targetResult.value,
            action: 'ERROR',
            reason: 'Boutique not in your scope',
          },
          'ERROR',
          'Boutique not in your scope'
        )
      );
      continue;
    }

    const key = `${month}|${boutique.id}`;
    if (seenKeys.has(key)) {
      duplicateKeys.push(key);
      invalidRows.push({ rowIndex, message: 'Duplicate month for boutique' });
      previewRows.push(
        finalizePreviewRow(
          {
            ...base,
            month,
            boutiqueId: boutique.id,
            boutiqueCode: boutique.code ?? scopeId,
            boutiqueName: boutiqueName || boutique.name,
            targetAmount: targetResult.value,
            newAmount: targetResult.value,
            action: 'ERROR',
            reason: 'Duplicate month for boutique',
          },
          'ERROR',
          'Duplicate month for boutique'
        )
      );
      continue;
    }
    seenKeys.add(key);

    const existingRow = existingMap.get(key);
    const writeAction = resolveTargetWriteAction(targetResult.value, existingRow ?? null);
    const resolvedName = boutiqueName || boutique.name;

    validRows.push({
      month,
      scopeId,
      boutiqueName: resolvedName,
      target: targetResult.value,
      source,
      notes,
    });

    const previewEntry = finalizePreviewRow(
      {
        rowNumber: rowIndex,
        month,
        boutiqueId: boutique.id,
        boutiqueCode: boutique.code ?? scopeId,
        boutiqueName: resolvedName,
        targetAmount: targetResult.value,
        existingAmount: existingRow?.amount ?? null,
        newAmount: targetResult.value,
        action: writeAction.action,
        reason: writeAction.reason ?? null,
      },
      writeAction.action,
      writeAction.reason ?? null
    );
    previewRows.push(previewEntry);

    if (writeAction.action === 'INSERT') {
      inserts.push({
        month,
        boutiqueId: boutique.id,
        boutiqueName: resolvedName,
        target: targetResult.value,
        source,
        notes,
      });
    } else if (writeAction.action === 'UPDATE' && existingRow) {
      updates.push({
        month,
        boutiqueId: boutique.id,
        boutiqueName: resolvedName,
        target: targetResult.value,
        source,
        notes,
        existingId: existingRow.id,
      });
    }
  }

  return {
    totalRows: dataRows.length,
    validRows,
    invalidRows,
    duplicateKeys: Array.from(new Set(duplicateKeys)),
    inserts,
    updates,
    unresolvedBoutiques: Array.from(unresolvedScopes),
    monthFormatErrors,
    targetFormatErrors,
    previewRows,
    previewTotals: computePreviewTotals(previewRows),
  };
}

/** Apply boutique import (transaction). Uses inserts/updates from dry-run preview. */
export async function applyBoutiquesImport(
  preview: Pick<BoutiquePreviewResult, 'inserts' | 'updates'>,
  createdById: string
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of preview.inserts) {
      await tx.boutiqueMonthlyTarget.create({
        data: {
          boutiqueId: row.boutiqueId,
          month: row.month,
          amount: row.target,
          source: row.source || null,
          notes: row.notes || null,
          createdById,
        },
      });
      inserted++;
    }
    for (const row of preview.updates) {
      await tx.boutiqueMonthlyTarget.update({
        where: { id: row.existingId },
        data: {
          amount: row.target,
          source: row.source || null,
          notes: row.notes || null,
          updatedAt: new Date(),
        },
      });
      updated++;
    }
  });

  return { inserted, updated };
}
