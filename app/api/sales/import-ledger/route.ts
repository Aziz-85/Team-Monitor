/**
 * POST /api/sales/import-ledger
 * Body: { boutiqueId, periodKey, fileName, fileHash?, rows: ImportLedgerRow[] }
 * RBAC: MANAGER (active boutique only), ADMIN (any boutique).
 * Creates SalesLedgerBatch, SalesTransaction rows, ImportIssue for BLOCK/WARN.
 * Dedup: same boutiqueId+periodKey+fileHash skips (409).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { coverageForTxn } from '@/lib/coverageForTxn';
import { parseDateRiyadh, formatDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import type { SalesTxnType, ImportIssueSeverity } from '@prisma/client';

export type ImportLedgerRow = {
  empId?: string;
  employeeId?: string;
  email?: string;
  name?: string;
  date?: string;
  txnDate?: string;
  type?: 'SALE' | 'RETURN' | 'EXCHANGE';
  amount?: number;
  amountSar?: number;
  grossAmount?: number;
  referenceNo?: string;
  lineNo?: string;
  originalReference?: string;
  rowIndex?: number;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Resolve employee: empId -> email -> exact name. Returns empId or null. */
async function resolveEmployee(row: ImportLedgerRow): Promise<string | null> {
  const empId = (row.empId ?? row.employeeId ?? '').trim();
  if (empId) {
    const e = await prisma.employee.findUnique({
      where: { empId, active: true },
      select: { empId: true },
    });
    if (e) return e.empId;
  }
  const email = (row.email ?? '').trim().toLowerCase();
  if (email) {
    const e = await prisma.employee.findFirst({
      where: { email, active: true },
      select: { empId: true },
    });
    if (e) return e.empId;
  }
  const name = (row.name ?? '').trim();
  if (name) {
    const norm = normalizeName(name);
    const all = await prisma.employee.findMany({
      where: { active: true },
      select: { empId: true, name: true },
    });
    const match = all.find((e) => normalizeName(e.name) === norm);
    if (match) return match.empId;
  }
  return null;
}

/** Infer type from row; if amount < 0 => RETURN. */
function inferType(row: ImportLedgerRow, amountSar: number): SalesTxnType {
  const t = (row.type ?? '').toUpperCase();
  if (t === 'RETURN' || t === 'EXCHANGE') return t as SalesTxnType;
  if (amountSar < 0) return 'RETURN';
  return 'SALE';
}

/** Convert amount to halalas (SAR * 100). Accepts negative for returns. */
function toHalalas(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }
  return null;
}

/** Check EmployeeAssignment for txnDate at boutiqueId. */
async function hasAssignment(
  empId: string,
  boutiqueId: string,
  txnDate: Date
): Promise<boolean> {
  const dateOnly = txnDate;
  const a = await prisma.employeeAssignment.findFirst({
    where: {
      empId,
      boutiqueId,
      fromDate: { lte: dateOnly },
      OR: [{ toDate: null }, { toDate: { gte: dateOnly } }],
    },
  });
  return !!a;
}

export async function POST(request: NextRequest) {
  const scopeResult = await getSalesScope({
    requireImport: true,
    requestBoutiqueId: undefined,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  let body: {
    boutiqueId?: string;
    periodKey?: string;
    fileName?: string;
    fileHash?: string | null;
    rows?: ImportLedgerRow[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const boutiqueId = (body.boutiqueId ?? '').trim();
  const periodKey = (body.periodKey ?? '').trim();
  const fileName = (body.fileName ?? 'import').trim();
  const fileHash = (body.fileHash ?? null) as string | null;
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!boutiqueId || !periodKey) {
    return NextResponse.json(
      { error: 'boutiqueId and periodKey are required' },
      { status: 400 }
    );
  }

  // Enforce boutique: MANAGER must use active; ADMIN can pass any
  if (scope.role !== 'ADMIN' && boutiqueId !== scope.effectiveBoutiqueId) {
    return NextResponse.json(
      { error: 'Boutique must match your operational boutique' },
      { status: 403 }
    );
  }

  // Verify boutique exists
  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true },
  });
  if (!boutique) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 400 });
  }

  // Dedup: same boutiqueId + periodKey + fileHash
  if (fileHash) {
    const existing = await prisma.salesLedgerBatch.findUnique({
      where: {
        boutiqueId_periodKey_fileHash: { boutiqueId, periodKey, fileHash },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate import: this file was already imported for this boutique and period', batchId: existing.id },
        { status: 409 }
      );
    }
  }

  const batchId = crypto.randomUUID();
  const issues: { severity: ImportIssueSeverity; message: string; rowIndex?: number; metadata?: object }[] = [];
  const transactions: Array<{
    txnDate: Date;
    boutiqueId: string;
    employeeId: string;
    type: SalesTxnType;
    referenceNo: string | null;
    lineNo: string | null;
    grossAmount: number;
    netAmount: number;
    originalTxnId: string | null;
    isGuestCoverage: boolean;
    coverageSourceBoutiqueId: string | null;
    coverageShift: string | null;
    metadata: object | null;
    rowIndex?: number;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as ImportLedgerRow;
    const rowIndex = row.rowIndex ?? i + 1;

    const dateStr = row.date ?? row.txnDate ?? '';
    const txnDate = parseDateRiyadh(dateStr || '1970-01-01');
    const empId = await resolveEmployee(row);
    if (!empId) {
      issues.push({
        severity: 'BLOCK',
        message: 'Employee not found (empId/email/name)',
        rowIndex,
        metadata: { empId: row.empId ?? row.employeeId, email: row.email, name: row.name },
      });
      continue;
    }

    const amountSar = row.amount ?? row.amountSar ?? 0;
    const halalas = toHalalas(amountSar);
    if (halalas === null) {
      issues.push({ severity: 'BLOCK', message: 'Invalid amount', rowIndex });
      continue;
    }

    const type = inferType(row, amountSar);
    const grossAmount = type === 'SALE' ? halalas : Math.abs(halalas);
    let netAmount = halalas;
    if (type === 'RETURN') netAmount = -Math.abs(halalas);
    else if (type === 'EXCHANGE') netAmount = 0; // or diff; spec says "EXCHANGE diff or 0"

    const coverage = await coverageForTxn({
      boutiqueId,
      employeeId: empId,
      txnDate,
    });

    let assignmentVerified = true;
    const assignment = await hasAssignment(empId, boutiqueId, txnDate);
    if (!assignment) {
      assignmentVerified = false;
      issues.push({
        severity: 'WARN',
        message: 'No EmployeeAssignment for this employee/boutique/date; transaction stored with assignmentVerified=false',
        rowIndex,
        metadata: { empId, boutiqueId, date: formatDateRiyadh(txnDate) },
      });
    }

    let originalTxnId: string | null = null;
    const originalRef = (row.originalReference ?? '').trim();
    const referenceNo = (row.referenceNo ?? '').trim() || null;
    const lineNo = (row.lineNo ?? '').trim() || null;

    if ((type === 'RETURN' || type === 'EXCHANGE') && originalRef) {
      const orig = await prisma.salesTransaction.findFirst({
        where: {
          boutiqueId,
          type: 'SALE',
          referenceNo: originalRef,
        },
        select: { id: true },
      });
      if (orig) originalTxnId = orig.id;
      else {
        issues.push({
          severity: 'WARN',
          message: 'Unmatched return/exchange: original sale not found',
          rowIndex,
          metadata: { originalReference: originalRef },
        });
      }
    }

    transactions.push({
      txnDate,
      boutiqueId,
      employeeId: empId,
      type,
      referenceNo,
      lineNo,
      grossAmount,
      netAmount,
      originalTxnId,
      isGuestCoverage: coverage.isGuestCoverage,
      coverageSourceBoutiqueId: coverage.sourceBoutiqueId,
      coverageShift: coverage.shift,
      metadata: { assignmentVerified, rowIndex },
      rowIndex,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesLedgerBatch.create({
      data: {
        id: batchId,
        boutiqueId,
        periodKey,
        fileName,
        fileHash,
        importedById: scope.userId,
      },
    });
    for (const t of transactions) {
      await tx.salesTransaction.create({
        data: {
          txnDate: t.txnDate,
          boutiqueId: t.boutiqueId,
          employeeId: t.employeeId,
          type: t.type,
          referenceNo: t.referenceNo,
          lineNo: t.lineNo,
          grossAmount: t.grossAmount,
          netAmount: t.netAmount,
          originalTxnId: t.originalTxnId,
          isGuestCoverage: t.isGuestCoverage,
          coverageSourceBoutiqueId: t.coverageSourceBoutiqueId,
          coverageShift: t.coverageShift,
          metadata: t.metadata ?? undefined,
          source: 'EXCEL_IMPORT',
          importBatchId: batchId,
        },
      });
    }
    for (const iss of issues) {
      await tx.importIssue.create({
        data: {
          batchId,
          severity: iss.severity,
          status: 'OPEN',
          message: iss.message,
          rowIndex: iss.rowIndex,
          metadata: iss.metadata ?? undefined,
        },
      });
    }
  });

  return NextResponse.json({
    batchId,
    created: transactions.length,
    issuesCount: issues.length,
    issuesBlock: issues.filter((i) => i.severity === 'BLOCK').length,
    issuesWarn: issues.filter((i) => i.severity === 'WARN').length,
  });
}
