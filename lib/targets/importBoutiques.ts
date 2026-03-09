/**
 * Boutique targets import: parse, validate, preview, apply.
 * Strict: required sheet, exact column order, YYYY-MM, integer target, no duplicates.
 *
 * Business rules: Boutique monthly target is the parent for that boutique/month;
 * employee targets are child allocations. All amounts integer SAR only.
 * We do not force employee total to equal boutique target; mismatch is shown in import preview only.
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
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

function parseTarget(raw: unknown): { value: number; error?: string } {
  if (raw == null || raw === '') return { value: 0, error: 'Target is required' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: 0, error: 'Target must be a number' };
  if (Math.floor(n) !== n) return { value: 0, error: 'Target must be integer' };
  if (n < 0) return { value: 0, error: 'Target must be non-negative' };
  return { value: n };
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

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: BOUTIQUE_HEADERS,
    range: 0,
    defval: '',
    raw: false,
  });

  // Skip header row (first row might be headers)
  const dataRows = rows.filter((r) => {
    const first = r?.Month ?? r?.month;
    return first != null && String(first).trim() !== '' && String(first) !== 'Month';
  });

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
    const r = dataRows[i] as Record<string, unknown>;
    const rowIndex = i + 2; // 1-based + header
    const month = trim(r.Month ?? r.month);
    const scopeId = trim(r.ScopeId ?? r.scopeId);
    const boutiqueName = trim(r.BoutiqueName ?? r.boutiqueName);
    const targetRaw = r.Target ?? r.target;
    const source = trim(r.Source ?? r.source) || 'OFFICIAL';
    const notes = trim(r.Notes ?? r.notes);

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

    const targetResult = parseTarget(targetRaw);
    if (targetResult.error) {
      targetFormatErrors++;
      invalidRows.push({ rowIndex, message: targetResult.error, row: { month, scopeId, boutiqueName, target: 0, source, notes } });
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
