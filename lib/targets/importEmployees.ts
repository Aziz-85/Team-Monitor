/**
 * Employee targets import: parse, validate, preview, apply.
 * Resolve employee by EmployeeCode (empId) first; then by name only if unique.
 * Historical / resigned allowed if User exists.
 *
 * Business rules (strict):
 * - Boutique monthly target is the parent; employee targets are child allocations for same boutique/month.
 * - We never force employee total to equal boutique target; mismatch is shown only as a warning.
 * - All target amounts are integer SAR only.
 * - Historical data remains stable: target is stored by (boutiqueId, month, userId); no inference from current boutique.
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { EMPLOYEE_SHEET, EMPLOYEE_HEADERS } from './templates';

export type EmployeeTargetRow = {
  month: string;
  scopeId: string;
  boutiqueName: string;
  employeeCode: string;
  employeeName: string;
  target: number;
  source: string;
  notes: string;
};

export type EmployeeRowError = {
  rowIndex: number;
  message: string;
  row?: EmployeeTargetRow;
};

export type EmployeePreviewResult = {
  totalRows: number;
  validRows: (EmployeeTargetRow & { userId: string; boutiqueId: string })[];
  invalidRows: EmployeeRowError[];
  duplicateKeys: string[];
  inserts: { month: string; boutiqueId: string; userId: string; target: number; source: string; notes: string }[];
  updates: { id: string; month: string; boutiqueId: string; userId: string; target: number; source: string; notes: string }[];
  unresolvedEmployees: string[];
  unresolvedBoutiques: string[];
  monthFormatErrors: number;
  targetFormatErrors: number;
  sumMismatchWarnings: { month: string; boutiqueId: string; boutiqueSum: number; employeeSum: number }[];
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

/** Resolve to userId: 1) by empId (EmployeeCode), 2) by name only if single match. */
async function resolveEmployee(
  employeeCode: string,
  employeeName: string,
  prismaClient: typeof prisma
): Promise<{ userId: string } | { error: string }> {
  const code = employeeCode.trim();
  const name = employeeName.trim();
  if (code) {
    const user = await prismaClient.user.findUnique({
      where: { empId: code },
      select: { id: true },
    });
    if (user) return { userId: user.id };
    const emp = await prismaClient.employee.findUnique({
      where: { empId: code },
      select: { empId: true },
    });
    if (emp) return { error: `Employee ${code} has no user account; cannot assign target` };
    return { error: `EmployeeCode not found: ${code}` };
  }
  if (!name) return { error: 'EmployeeCode or EmployeeName required' };
  const employees = await prismaClient.employee.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { empId: true },
  });
  const userIds: string[] = [];
  for (const e of employees) {
    const u = await prismaClient.user.findUnique({
      where: { empId: e.empId },
      select: { id: true },
    });
    if (u) userIds.push(u.id);
  }
  if (userIds.length === 0) return { error: `No user found for name: ${name}` };
  if (userIds.length > 1) return { error: `Ambiguous employee name: ${name} (multiple users)` };
  return { userId: userIds[0] };
}

export async function parseAndValidateEmployees(
  buffer: Buffer,
  allowedBoutiqueIds: string[]
): Promise<EmployeePreviewResult> {
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
      unresolvedEmployees: [],
      unresolvedBoutiques: [],
      monthFormatErrors: 0,
      targetFormatErrors: 0,
      sumMismatchWarnings: [],
    };
  }

  const sheet = workbook.Sheets[EMPLOYEE_SHEET];
  if (!sheet) {
    return {
      totalRows: 0,
      validRows: [],
      invalidRows: [{ rowIndex: 0, message: `Missing sheet: ${EMPLOYEE_SHEET}` }],
      duplicateKeys: [],
      inserts: [],
      updates: [],
      unresolvedEmployees: [],
      unresolvedBoutiques: [],
      monthFormatErrors: 0,
      targetFormatErrors: 0,
      sumMismatchWarnings: [],
    };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: EMPLOYEE_HEADERS,
    range: 0,
    defval: '',
    raw: false,
  });

  const dataRows = rows.filter((r) => {
    const first = r?.Month ?? r?.month;
    return first != null && String(first).trim() !== '' && String(first) !== 'Month';
  });

  const boutiquesByCode = await prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  });
  const codeToBoutique = new Map(boutiquesByCode.map((b) => [b.code.trim().toUpperCase(), b]));

  const validRows: (EmployeeTargetRow & { userId: string; boutiqueId: string })[] = [];
  const invalidRows: EmployeeRowError[] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];
  let monthFormatErrors = 0;
  let targetFormatErrors = 0;
  const unresolvedEmps: Set<string> = new Set();
  const unresolvedScopes: Set<string> = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] as Record<string, unknown>;
    const rowIndex = i + 2;
    const month = trim(r.Month ?? r.month);
    const scopeId = trim(r.ScopeId ?? r.scopeId);
    const boutiqueName = trim(r.BoutiqueName ?? r.boutiqueName);
    const employeeCode = trim(r.EmployeeCode ?? r.employeeCode);
    const employeeName = trim(r.EmployeeName ?? r.employeeName);
    const targetRaw = r.Target ?? r.target;
    const source = trim(r.Source ?? r.source) || 'OFFICIAL';
    const notes = trim(r.Notes ?? r.notes);

    if (!month) {
      invalidRows.push({ rowIndex, message: 'Month is required' });
      continue;
    }
    if (!MONTH_REGEX.test(month)) {
      monthFormatErrors++;
      invalidRows.push({ rowIndex, message: 'Month must be YYYY-MM' });
      continue;
    }
    if (!scopeId) {
      invalidRows.push({ rowIndex, message: 'ScopeId is required' });
      continue;
    }

    const targetResult = parseTarget(targetRaw);
    if (targetResult.error) {
      targetFormatErrors++;
      invalidRows.push({ rowIndex, message: targetResult.error });
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

    const resolved = await resolveEmployee(employeeCode, employeeName, prisma);
    if ('error' in resolved) {
      unresolvedEmps.add(employeeCode || employeeName || `row ${rowIndex}`);
      invalidRows.push({ rowIndex, message: resolved.error });
      continue;
    }

    const key = `${month}|${boutique.id}|${resolved.userId}`;
    if (seenKeys.has(key)) {
      duplicateKeys.push(key);
    }
    seenKeys.add(key);

    validRows.push({
      month,
      scopeId,
      boutiqueName,
      employeeCode,
      employeeName,
      target: targetResult.value,
      source,
      notes,
      userId: resolved.userId,
      boutiqueId: boutique.id,
    });
  }

  const existing = await prisma.employeeMonthlyTarget.findMany({
    where: {
      boutiqueId: { in: allowedBoutiqueIds },
      month: { in: Array.from(new Set(validRows.map((r) => r.month))) },
    },
    select: { id: true, boutiqueId: true, month: true, userId: true, amount: true },
  });
  const existingMap = new Map(existing.map((e) => [`${e.month}|${e.boutiqueId}|${e.userId}`, e]));

  const inserts: EmployeePreviewResult['inserts'] = [];
  const updates: EmployeePreviewResult['updates'] = [];

  for (const row of validRows) {
    const key = `${row.month}|${row.boutiqueId}|${row.userId}`;
    const ex = existingMap.get(key);
    if (ex) {
      updates.push({
        id: ex.id,
        month: row.month,
        boutiqueId: row.boutiqueId,
        userId: row.userId,
        target: row.target,
        source: row.source,
        notes: row.notes,
      });
    } else {
      inserts.push({
        month: row.month,
        boutiqueId: row.boutiqueId,
        userId: row.userId,
        target: row.target,
        source: row.source,
        notes: row.notes,
      });
    }
  }

  // Sum mismatch: for each (month, boutiqueId) compare sum(employee targets) to BoutiqueMonthlyTarget.
  // Warning only — we never force employee total to equal boutique target; user sees mismatch clearly.
  const sumMismatchWarnings: EmployeePreviewResult['sumMismatchWarnings'] = [];
  const byMonthBoutique = new Map<string, { boutiqueSum: number; employeeSum: number }>();
  for (const row of validRows) {
    const k = `${row.month}|${row.boutiqueId}`;
    const cur = byMonthBoutique.get(k) ?? { boutiqueSum: 0, employeeSum: 0 };
    cur.employeeSum += row.target;
    byMonthBoutique.set(k, cur);
  }
  const boutiqueTargets = await prisma.boutiqueMonthlyTarget.findMany({
    where: { boutiqueId: { in: allowedBoutiqueIds }, month: { in: Array.from(new Set(validRows.map((r) => r.month))) } },
    select: { boutiqueId: true, month: true, amount: true },
  });
  for (const bt of boutiqueTargets) {
    const k = `${bt.month}|${bt.boutiqueId}`;
    const cur = byMonthBoutique.get(k);
    if (cur) cur.boutiqueSum = bt.amount;
  }
  for (const [k, v] of Array.from(byMonthBoutique.entries())) {
    if (v.boutiqueSum !== v.employeeSum && (v.boutiqueSum > 0 || v.employeeSum > 0)) {
      const [month, boutiqueId] = k.split('|');
      sumMismatchWarnings.push({
        month,
        boutiqueId,
        boutiqueSum: v.boutiqueSum,
        employeeSum: v.employeeSum,
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
    unresolvedEmployees: Array.from(unresolvedEmps),
    unresolvedBoutiques: Array.from(unresolvedScopes),
    monthFormatErrors,
    targetFormatErrors,
    sumMismatchWarnings,
  };
}

export async function applyEmployeesImport(
  preview: EmployeePreviewResult
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of preview.inserts) {
      await tx.employeeMonthlyTarget.create({
        data: {
          boutiqueId: row.boutiqueId,
          month: row.month,
          userId: row.userId,
          amount: row.target,
          source: row.source || null,
          notes: row.notes || null,
        },
      });
      inserted++;
    }
    for (const row of preview.updates) {
      await tx.employeeMonthlyTarget.update({
        where: { id: row.id },
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
