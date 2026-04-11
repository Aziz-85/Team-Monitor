/**
 * MSR V2 template → SalesEntry import planning (dry-run) and shared types.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import { isOperationalEmployee } from '@/lib/userClassification';
import {
  MSR_V2_CANONICAL_EMPLOYEES,
  parseMsrTemplateV2FromAoa,
  resolveMsrV2ColumnMap,
  resolveTemplateHeaderToUniqueUser,
  type MsrTemplateMatchCandidate,
  type MsrV2SheetParse,
} from '@/lib/sales/msrTemplateParse';
import {
  findDuplicateStableKeysInImport,
  type ImportCellForDedupe,
  salesEntryImportStableKey,
} from '@/lib/sales/salesEntryImportStableKey';

export type MsrTemplatePlanPreview = {
  parsed: MsrV2SheetParse;
  fileTotals: { transformedSalesSum: number; cellCount: number };
  duplicateStableKeys: Array<{ stableKey: string; entries: ImportCellForDedupe[] }>;
  wouldCreate: number;
  wouldUpdate: number;
  wouldNoChange: number;
  /** Column index → user (apply path must match plan). */
  columnToUser: Array<{ columnIndex: number; userId: string; employeeName: string }>;
  plannedRows: Array<{
    boutiqueId: string;
    dateKey: string;
    userId: string;
    incoming: number;
    existingAmount: number | null;
    existingSource: string | null;
    rowLabel: string;
  }>;
};

function assertDistinctUsersPerColumn(
  columnToUser: Map<number, { userId: string; employeeName: string }>
): void {
  const seen = new Map<string, number[]>();
  for (const [col, v] of Array.from(columnToUser.entries())) {
    const list = seen.get(v.userId) ?? [];
    list.push(col);
    seen.set(v.userId, list);
  }
  const collisions = Array.from(seen.entries()).filter(([, cols]) => cols.length > 1);
  if (collisions.length > 0) {
    const detail = collisions.map(([uid, cols]) => `${uid}←cols ${cols.join(',')}`).join('; ');
    throw new Error(`Two or more MSR columns resolve to the same employee userId (ambiguous match): ${detail}`);
  }
}

export async function buildMsrTemplateImportPlan(input: {
  rows: unknown[][];
  headerRow: string[];
  headerIndex: number;
  monthParam: string;
  maxDataRows: number;
  getUserIdToBoutiqueId: (userIds: string[]) => Promise<Map<string, string>>;
  getDefaultBoutiqueId: () => Promise<string>;
}): Promise<MsrTemplatePlanPreview> {
  const v2map = resolveMsrV2ColumnMap(input.headerRow);
  if (!v2map) {
    throw new Error(
      `MSR V2 requires Date plus columns: ${MSR_V2_CANONICAL_EMPLOYEES.join(', ')}`
    );
  }

  const usersForMatch = await prisma.user.findMany({
    where: { disabled: false },
    select: {
      id: true,
      empId: true,
      boutiqueId: true,
      employee: { select: { empId: true, name: true, isSystemOnly: true } },
    },
  });
  const matchCandidates: MsrTemplateMatchCandidate[] = [];
  for (const u of usersForMatch) {
    const e = u.employee;
    if (!e || !isOperationalEmployee(e)) continue;
    matchCandidates.push({
      userId: u.id,
      empId: u.empId,
      boutiqueId: u.boutiqueId,
      name: e.name,
    });
  }
  const validEmpIds = new Set(matchCandidates.map((c) => c.empId));

  const columnToUser = new Map<number, { userId: string; employeeName: string }>();
  const unmapped: string[] = [];
  for (const name of MSR_V2_CANONICAL_EMPLOYEES) {
    const col = v2map.employeeColByCanonical.get(name)!;
    const label = String(input.headerRow[col] ?? '').trim() || name;
    const resolved = resolveTemplateHeaderToUniqueUser(label, matchCandidates, validEmpIds);
    if (resolved) {
      columnToUser.set(col, { userId: resolved.userId, employeeName: resolved.name });
    } else {
      unmapped.push(label);
    }
  }
  if (unmapped.length > 0) {
    throw new Error(`Unmapped MSR columns: ${unmapped.join(', ')}`);
  }
  assertDistinctUsersPerColumn(columnToUser);

  const parsed = parseMsrTemplateV2FromAoa(input.rows, {
    headerRowIndex: input.headerIndex,
    columnMap: v2map,
    monthFilter: input.monthParam,
    maxDataRows: input.maxDataRows,
  });

  const templateUserIds = Array.from(
    new Set(Array.from(columnToUser.values()).map((v) => v.userId))
  );
  const userIdToBoutique =
    templateUserIds.length > 0 ? await input.getUserIdToBoutiqueId(templateUserIds) : new Map();
  const defaultBoutiqueId = await input.getDefaultBoutiqueId();

  const importCells: ImportCellForDedupe[] = [];
  let transformedSalesSum = 0;
  for (const cell of parsed.rows) {
    const mapped = columnToUser.get(cell.columnIndex);
    if (!mapped) continue;
    const boutiqueId = userIdToBoutique.get(mapped.userId) ?? defaultBoutiqueId;
    transformedSalesSum += cell.sales;
    importCells.push({
      boutiqueId,
      dateKey: cell.dateKey,
      userId: mapped.userId,
      amount: cell.sales,
      rowLabel: `row ${cell.sourceRowNumber} ${cell.employeeHeader}`,
    });
  }

  const duplicateStableKeys = findDuplicateStableKeysInImport(importCells);

  const uniqueKeys = Array.from(
    new Map(
      importCells.map((c) => [
        salesEntryImportStableKey(c.boutiqueId, c.dateKey, c.userId),
        c,
      ])
    ).values()
  );

  const orWhere =
    uniqueKeys.length > 0
      ? (uniqueKeys.map((c) => ({
          boutiqueId_dateKey_userId: {
            boutiqueId: c.boutiqueId,
            dateKey: c.dateKey,
            userId: c.userId,
          },
        })) as Prisma.SalesEntryWhereInput[])
      : [];

  const existingRows =
    orWhere.length > 0
      ? await prisma.salesEntry.findMany({
          where: { OR: orWhere },
          select: { boutiqueId: true, dateKey: true, userId: true, amount: true, source: true },
        })
      : [];

  const existingMap = new Map<string, { amount: number; source: string | null }>();
  for (const e of existingRows) {
    existingMap.set(salesEntryImportStableKey(e.boutiqueId, e.dateKey, e.userId), {
      amount: e.amount,
      source: e.source,
    });
  }

  let wouldCreate = 0;
  let wouldUpdate = 0;
  let wouldNoChange = 0;
  const plannedRows: MsrTemplatePlanPreview['plannedRows'] = [];

  const excelSrc = SALES_ENTRY_SOURCE.EXCEL_IMPORT.trim().toUpperCase();
  for (const c of importCells) {
    const k = salesEntryImportStableKey(c.boutiqueId, c.dateKey, c.userId);
    const ex = existingMap.get(k) ?? null;
    if (!ex) {
      wouldCreate += 1;
    } else if (
      ex.amount === c.amount &&
      (ex.source ?? '').trim().toUpperCase() === excelSrc
    ) {
      wouldNoChange += 1;
    } else {
      wouldUpdate += 1;
    }
    plannedRows.push({
      boutiqueId: c.boutiqueId,
      dateKey: c.dateKey,
      userId: c.userId,
      incoming: c.amount,
      existingAmount: ex?.amount ?? null,
      existingSource: ex?.source ?? null,
      rowLabel: c.rowLabel,
    });
  }

  return {
    parsed,
    fileTotals: { transformedSalesSum, cellCount: importCells.length },
    duplicateStableKeys,
    wouldCreate,
    wouldUpdate,
    wouldNoChange,
    columnToUser: Array.from(columnToUser.entries()).map(([columnIndex, v]) => ({
      columnIndex,
      userId: v.userId,
      employeeName: v.employeeName,
    })),
    plannedRows,
  };
}
