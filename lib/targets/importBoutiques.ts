/**
 * Boutique targets import: parse, validate, preview, apply.
 * Strict: required sheet, header names, YYYY-MM, integer target, no duplicates.
 *
 * Business rules: Boutique monthly target is the parent for that boutique/month;
 * employee targets are child allocations. All amounts integer SAR only.
 * We do not force employee total to equal boutique target; mismatch is shown in import preview only.
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
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

export type BoutiquePreviewResult = {
  totalRows: number;
  validRows: BoutiqueTargetRow[];
  invalidRows: BoutiqueRowError[];
  duplicateKeys: string[]; // "month|boutiqueId"
  inserts: { month: string; boutiqueId: string; boutiqueName: string; target: number; source: string; notes: string }[];
  updates: { month: string; boutiqueId: string; boutiqueName: string; target: number; source: string; notes: string; existingId: string }[];
  unresolvedBoutiques: string[]; // ScopeId or names that didn't resolve
  monthFormatErrors: number;
  targetFormatErrors: number;
};

const MONTH_REGEX = /^\d{4}-\d{2}$/;

function trim(s: unknown): string {
  if (s == null) return '';
  return String(s).trim();
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
    return {
      totalRows: 0,
      validRows: [],
      invalidRows: [{ rowIndex: 0, message: 'Invalid Excel file' }],
      duplicateKeys: [],
      inserts: [],
      updates: [],
      unresolvedBoutiques: [],
      monthFormatErrors: 0,
      targetFormatErrors: 0,
    };
  }

  const sheet = workbook.Sheets[BOUTIQUE_SHEET];
  if (!sheet) {
    return {
      totalRows: 0,
      validRows: [],
      invalidRows: [{ rowIndex: 0, message: `Missing sheet: ${BOUTIQUE_SHEET}` }],
      duplicateKeys: [],
      inserts: [],
      updates: [],
      unresolvedBoutiques: [],
      monthFormatErrors: 0,
      targetFormatErrors: 0,
    };
  }

  const parsedSheet = readRowsByHeaders(sheet, BOUTIQUE_HEADERS);
  if (!parsedSheet.ok) {
    return {
      totalRows: 0,
      validRows: [],
      invalidRows: [{ rowIndex: 0, message: parsedSheet.error }],
      duplicateKeys: [],
      inserts: [],
      updates: [],
      unresolvedBoutiques: [],
      monthFormatErrors: 0,
      targetFormatErrors: 0,
    };
  }

  const { rows: dataRows, rowIndexes, detectedHeaders } = parsedSheet;

  const boutiquesByCode = await prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  });
  const codeToBoutique = new Map(boutiquesByCode.map((b) => [b.code.trim().toUpperCase(), b]));

  const validRows: BoutiqueTargetRow[] = [];
  const invalidRows: BoutiqueRowError[] = [];
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

    if (!month) {
      invalidRows.push({ rowIndex, message: 'Month is required' });
      continue;
    }
    if (!MONTH_REGEX.test(month)) {
      monthFormatErrors++;
      invalidRows.push({ rowIndex, message: 'Month must be YYYY-MM', row: { month, scopeId, boutiqueName, target: 0, source, notes } });
      continue;
    }
    if (!scopeId) {
      invalidRows.push({ rowIndex, message: 'ScopeId is required' });
      continue;
    }

    const targetResult = parseTargetValue(targetRaw);
    if (targetResult.kind === 'empty') continue;
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
      continue;
    }

    const boutique = codeToBoutique.get(scopeId.trim().toUpperCase());
    if (!boutique) {
      unresolvedScopes.add(scopeId);
      invalidRows.push({ rowIndex, message: `ScopeId not found: ${scopeId}` });
      continue;
    }
    if (!allowedBoutiqueIds.includes(boutique.id)) {
      invalidRows.push({ rowIndex, message: 'Boutique not in your scope' });
      continue;
    }

    const key = `${month}|${boutique.id}`;
    if (seenKeys.has(key)) {
      duplicateKeys.push(key);
    }
    seenKeys.add(key);

    validRows.push({
      month,
      scopeId,
      boutiqueName,
      target: targetResult.value,
      source,
      notes,
    });
  }

  // Resolve inserts vs updates
  const existing = await prisma.boutiqueMonthlyTarget.findMany({
    where: {
      boutiqueId: { in: allowedBoutiqueIds },
      month: { in: Array.from(new Set(validRows.map((r) => r.month))) },
    },
    select: { id: true, boutiqueId: true, month: true, amount: true },
  });
  const existingMap = new Map(existing.map((e) => [`${e.month}|${e.boutiqueId}`, e]));

  const inserts: BoutiquePreviewResult['inserts'] = [];
  const updates: BoutiquePreviewResult['updates'] = [];

  for (const row of validRows) {
    const boutique = codeToBoutique.get(row.scopeId.trim().toUpperCase())!;
    const key = `${row.month}|${boutique.id}`;
    const ex = existingMap.get(key);
    if (ex) {
      updates.push({
        month: row.month,
        boutiqueId: boutique.id,
        boutiqueName: row.boutiqueName || boutique.name,
        target: row.target,
        source: row.source,
        notes: row.notes,
        existingId: ex.id,
      });
    } else {
      inserts.push({
        month: row.month,
        boutiqueId: boutique.id,
        boutiqueName: row.boutiqueName || boutique.name,
        target: row.target,
        source: row.source,
        notes: row.notes,
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
  };
}

/** Apply boutique import (transaction). Call after preview; uses same logic for inserts/updates. */
export async function applyBoutiquesImport(
  preview: BoutiquePreviewResult,
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
