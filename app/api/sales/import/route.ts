/**
 * POST /api/sales/import
 * Multipart: file (Excel), body/params: boutiqueId, date
 * RBAC: ADMIN, MANAGER. Parse Excel, create batch, return preview (do not apply if mismatch).
 *
 * Employee matching policy (server-side only):
 * 1) Try match by empId. If found, use that empId.
 * 2) If name column present and value differs from Employee.name, log warning but allow.
 * 3) If empId not found: try exact name match. If multiple matches OR no match → row UNMATCHED.
 * 4) Do NOT auto-create users. Reject apply if unmatchedRowsCount > 0.
 * 5) Store matchedRowsCount, warningRowsCount, unmatchedRowsCount in totalsJson.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { validateSarInteger } from '@/lib/sales/reconcile';
import * as XLSX from 'xlsx';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER'] as const;
const ALLOWED_EXTENSIONS = /\.(xlsx|xlsm|xls)$/i;
const MAX_ROWS = 500;

type ParsedRow = { employeeId: string; amountSar: number; rowNumber: number; warning?: string };

function findColumnIndex(headerRow: string[], ...candidates: string[]): number {
  const lower = headerRow.map((h) => String(h ?? '').trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c) || c.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

function parseIntegerSar(value: unknown): { ok: true; value: number } | { ok: false } {
  const result = validateSarInteger(value);
  return result.ok ? { ok: true, value: result.value } : { ok: false };
}

/** Normalize for comparison: trim, single spaces, lowercase */
function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const boutiqueId = (formData.get('boutiqueId') as string)?.trim() ?? '';
  const dateParam = (formData.get('date') as string)?.trim() ?? '';

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }
  const fileName = (file.name || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.test(fileName)) {
    return NextResponse.json({ error: 'File must be .xlsx, .xlsm, or .xls' }, { status: 400 });
  }

  const date = parseDateRiyadh(dateParam);
  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'No operational boutique available' }, { status: 403 });
  }
  if (boutiqueId !== scope.boutiqueId) {
    return NextResponse.json({ error: 'Boutique must match your operational boutique' }, { status: 400 });
  }

  let workbook: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return NextResponse.json({ error: 'Invalid Excel file' }, { status: 400 });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return NextResponse.json({ error: 'No sheet found' }, { status: 400 });

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (rows.length < 2) {
    return NextResponse.json({
      preview: { managerTotalSar: 0, linesTotalSar: 0, diffSar: 0, rowCount: 0 },
      batchId: null,
      applied: false,
      error: 'Excel must have header row and at least one data row',
    });
  }

  const headerRow = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
  const empCol = findColumnIndex(
    headerRow,
    'empid',
    'employee id',
    'employeeid',
    'id',
    'name',
    'employee',
    'اسم'
  );
  const amountCol = findColumnIndex(headerRow, 'amount', 'sales', 'sar', 'ريال', 'total');
  if (empCol < 0 || amountCol < 0) {
    return NextResponse.json({
      error: 'Excel must have columns for employee (empId / Employee ID / Name) and amount (Amount / Sales / SAR)',
      headerRow,
    }, { status: 400 });
  }
  const nameCol = findColumnIndex(headerRow, 'name', 'اسم', 'employee name');
  const useNameCol = nameCol >= 0 && nameCol !== empCol;

  const [employeesInBoutique, allEmpBoutique] = await Promise.all([
    prisma.employee.findMany({
      where: { boutiqueId, active: true },
      select: { empId: true, name: true },
    }),
    prisma.employee.findMany({
      select: { empId: true, boutiqueId: true },
    }),
  ]);
  const empIdToBoutique = new Map(allEmpBoutique.map((e) => [e.empId, e.boutiqueId]));
  const byEmpId = new Map<string, { empId: string; name: string | null }>(
    employeesInBoutique.map((e) => [e.empId.trim().toLowerCase(), { empId: e.empId, name: e.name ?? null }])
  );
  const nameToEmpIds = new Map<string, string[]>();
  for (const e of employeesInBoutique) {
    if (!e.name?.trim()) continue;
    const key = normalizeName(e.name);
    const list = nameToEmpIds.get(key) ?? [];
    list.push(e.empId);
    nameToEmpIds.set(key, list);
  }
  const byExactName = new Map<string, string>();
  for (const [key, empIds] of Array.from(nameToEmpIds.entries())) {
    if (empIds.length === 1) byExactName.set(key, empIds[0]);
  }

  const parsed: ParsedRow[] = [];
  const warnings: string[] = [];
  let matchedRowsCount = 0;
  let warningRowsCount = 0;
  let unmatchedRowsCount = 0;

  for (let i = 1; i < Math.min(rows.length, MAX_ROWS + 1); i++) {
    const row = rows[i] as unknown[];
    const empRaw = String(row[empCol] ?? '').trim();
    const nameRaw = useNameCol ? String(row[nameCol] ?? '').trim() : '';
    const amountResult = parseIntegerSar(row[amountCol]);
    if (!amountResult.ok) {
      warnings.push(`Row ${i + 1}: invalid amount (must be integer SAR)`);
      continue;
    }
    if (!empRaw) {
      unmatchedRowsCount += 1;
      warnings.push(`Row ${i + 1}: missing employee identifier`);
      continue;
    }

    const empKey = empRaw.toLowerCase().trim();
    const empEntry = byEmpId.get(empKey);

    if (empEntry) {
      const nameMismatch = useNameCol && nameRaw && empEntry.name && normalizeName(nameRaw) !== normalizeName(empEntry.name);
      if (nameMismatch) {
        warningRowsCount += 1;
        parsed.push({
          employeeId: empEntry.empId,
          amountSar: amountResult.value,
          rowNumber: i + 1,
          warning: 'Name mismatch; matched by empId',
        });
      } else {
        matchedRowsCount += 1;
        parsed.push({ employeeId: empEntry.empId, amountSar: amountResult.value, rowNumber: i + 1 });
      }
      continue;
    }

    const nameMatchEmpId = byExactName.get(normalizeName(empRaw));
    if (nameMatchEmpId) {
      warningRowsCount += 1;
      parsed.push({
        employeeId: nameMatchEmpId,
        amountSar: amountResult.value,
        rowNumber: i + 1,
        warning: 'Matched by name; prefer empId for accuracy',
      });
      continue;
    }

    const otherBoutique = empIdToBoutique.get(empRaw) ?? empIdToBoutique.get(empRaw.toLowerCase());
    if (otherBoutique && otherBoutique !== boutiqueId) {
      unmatchedRowsCount += 1;
      warnings.push(`Row ${i + 1}: employee belongs to another boutique (EMPLOYEE_OTHER_BOUTIQUE)`);
      continue;
    }

    unmatchedRowsCount += 1;
    warnings.push(`Row ${i + 1}: employee not found (${empRaw})`);
  }

  const linesTotalSar = parsed.reduce((s, r) => s + r.amountSar, 0);

  let summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
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
    });
  }
  const managerTotalSar = summary.totalSar;
  const diffSar = managerTotalSar - linesTotalSar;

  const totalsJson = {
    managerTotalSar,
    linesTotalSar,
    diffSar,
    rowCount: parsed.length,
    matchedRowsCount,
    warningRowsCount,
    unmatchedRowsCount,
    rows: parsed.map((p) => ({ employeeId: p.employeeId, amountSar: p.amountSar })),
  };

  const batch = await prisma.salesImportBatch.create({
    data: {
      summaryId: summary.id,
      boutiqueId,
      date,
      fileName: file.name,
      importedById: user.id,
      totalsJson,
    },
  });

  return NextResponse.json({
    preview: {
      managerTotalSar,
      linesTotalSar,
      diffSar,
      rowCount: parsed.length,
      matchedRowsCount,
      warningRowsCount,
      unmatchedRowsCount,
      canApply: diffSar === 0 && unmatchedRowsCount === 0,
    },
    batchId: batch.id,
    applied: false,
    warnings: warnings.length ? warnings : undefined,
    nameMatchWarnings: parsed.some((p) => p.warning) ? ['Some rows matched by name or had name mismatch; prefer empId for accuracy'] : undefined,
  });
}
