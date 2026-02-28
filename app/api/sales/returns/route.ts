/**
 * GET /api/sales/returns?from=YYYY-MM-DD&to=YYYY-MM-DD&boutiqueId= (ADMIN optional)
 * Ledger of RETURN/EXCHANGE only. RBAC: EMPLOYEE = own; ASSISTANT_MANAGER/MANAGER = full boutique; ADMIN = any.
 * Response: { items, from, to, canAdd } (canAdd = true if user can POST manual return/exchange).
 *
 * POST /api/sales/returns — Add manual RETURN or EXCHANGE. Body: type, txnDate, employeeId, amountSar, referenceNo?, originalTxnId?.
 * RBAC: MANAGER, ASSISTANT_MANAGER (active boutique), ADMIN, SUPER_ADMIN.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { parseDateRiyadh, formatDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { coverageForTxn } from '@/lib/coverageForTxn';
import { buildEmployeeWhereForOperational } from '@/lib/employee/employeeQuery';

export async function GET(request: NextRequest) {
  const boutiqueIdParam = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const scopeResult = await getSalesScope({
    requestBoutiqueId: boutiqueIdParam || undefined,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  const fromParam = request.nextUrl.searchParams.get('from')?.trim();
  const toParam = request.nextUrl.searchParams.get('to')?.trim();
  const from = parseDateRiyadh(fromParam || '');
  const to = parseDateRiyadh(toParam || '');
  const fromDate = from.getTime() <= to.getTime() ? from : to;
  const toDate = from.getTime() <= to.getTime() ? to : from;

  const where: {
    boutiqueId?: string;
    employeeId?: string;
    txnDate: { gte: Date; lte: Date };
    type: { in: ['RETURN', 'EXCHANGE'] };
  } = {
    txnDate: { gte: fromDate, lte: toDate },
    type: { in: ['RETURN', 'EXCHANGE'] },
  };

  if (scope.employeeOnly && scope.empId) {
    where.employeeId = scope.empId;
  }
  if (scope.allowedBoutiqueIds.length > 0) {
    where.boutiqueId = scope.effectiveBoutiqueId;
  }

  const rows = await prisma.salesTransaction.findMany({
    where,
    orderBy: [{ txnDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      txnDate: true,
      boutiqueId: true,
      employeeId: true,
      type: true,
      referenceNo: true,
      lineNo: true,
      netAmount: true,
      originalTxnId: true,
      employee: { select: { name: true } },
    },
  });

  const toItem = (r: (typeof rows)[0]) => ({
    id: r.id,
    txnDate: formatDateRiyadh(r.txnDate),
    boutiqueId: r.boutiqueId,
    employeeId: r.employeeId,
    employeeName: r.employee?.name ?? r.employeeId,
    type: r.type,
    referenceNo: r.referenceNo,
    lineNo: r.lineNo,
    netAmount: r.netAmount,
    originalTxnId: r.originalTxnId,
  });

  type Item = ReturnType<typeof toItem>;
  const items = rows.map(toItem).sort(
    (a: Item, b: Item) => new Date(b.txnDate).getTime() - new Date(a.txnDate).getTime()
  );

  return NextResponse.json({
    from: formatDateRiyadh(fromDate),
    to: formatDateRiyadh(toDate),
    items,
    canAdd: scope.canAddManualReturn,
  });
}

export async function POST(request: NextRequest) {
  const scopeResult = await getSalesScope({
    requestBoutiqueId: undefined,
    requireManualReturn: true,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  let body: {
    type?: string;
    txnDate?: string;
    employeeId?: string;
    amountSar?: number;
    referenceNo?: string;
    originalTxnId?: string;
    boutiqueId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requestBoutiqueId = (body.boutiqueId ?? '').trim();
  const isAdminOrSuper = scope.role === 'ADMIN' || (scope.role as string) === 'SUPER_ADMIN';
  const boutiqueId =
    requestBoutiqueId && isAdminOrSuper ? requestBoutiqueId : scope.effectiveBoutiqueId;
  if (!boutiqueId) {
    return NextResponse.json(
      { error: 'boutiqueId required (e.g. when no active boutique)' },
      { status: 400 }
    );
  }
  if (scope.allowedBoutiqueIds.length > 0 && !scope.allowedBoutiqueIds.includes(boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden: boutique not in your scope' }, { status: 403 });
  }

  const typeRaw = (body.type ?? '').trim().toUpperCase();
  if (typeRaw !== 'RETURN' && typeRaw !== 'EXCHANGE') {
    return NextResponse.json({ error: 'type must be RETURN or EXCHANGE' }, { status: 400 });
  }
  const type = typeRaw as 'RETURN' | 'EXCHANGE';

  const txnDateStr = (body.txnDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDateStr)) {
    return NextResponse.json({ error: 'txnDate must be YYYY-MM-DD' }, { status: 400 });
  }
  const txnDate = new Date(txnDateStr + 'T12:00:00.000Z');

  const employeeId = (body.employeeId ?? '').trim();
  if (!employeeId) {
    return NextResponse.json({ error: 'employeeId is required' }, { status: 400 });
  }

  const allowed = await prisma.employee.findFirst({
    where: {
      ...buildEmployeeWhereForOperational(
        scope.allowedBoutiqueIds.length > 0 ? scope.allowedBoutiqueIds : [boutiqueId]
      ),
      empId: employeeId,
    },
    select: { empId: true },
  });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Employee not found or not in your boutique' },
      { status: 403 }
    );
  }

  const amountSar = body.amountSar;
  if (amountSar === undefined || amountSar === null) {
    return NextResponse.json({ error: 'amountSar is required' }, { status: 400 });
  }
  const amountNum = typeof amountSar === 'number' ? amountSar : Number(amountSar);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'amountSar must be a positive number' }, { status: 400 });
  }
  const halalas = Math.round(amountNum * 100);

  const referenceNo = (body.referenceNo ?? '').trim() || null;
  const originalTxnId = (body.originalTxnId ?? '').trim() || null;

  let grossAmount: number;
  let netAmount: number;
  if (type === 'RETURN') {
    grossAmount = halalas;
    netAmount = -halalas;
  } else {
    grossAmount = halalas;
    netAmount = 0;
  }

  const coverage = await coverageForTxn({
    boutiqueId,
    employeeId,
    txnDate,
  });

  const txn = await prisma.salesTransaction.create({
    data: {
      txnDate,
      boutiqueId,
      employeeId,
      type,
      source: 'MANUAL',
      referenceNo,
      lineNo: null,
      grossAmount,
      netAmount,
      originalTxnId,
      importBatchId: null,
      isGuestCoverage: coverage.isGuestCoverage,
      coverageSourceBoutiqueId: coverage.sourceBoutiqueId,
      coverageShift: coverage.shift,
    },
    select: {
      id: true,
      txnDate: true,
      boutiqueId: true,
      employeeId: true,
      type: true,
      referenceNo: true,
      netAmount: true,
      originalTxnId: true,
      employee: { select: { name: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    id: txn.id,
    txnDate: formatDateRiyadh(txn.txnDate),
    employeeId: txn.employeeId,
    employeeName: txn.employee?.name ?? txn.employeeId,
    type: txn.type,
    netAmount: txn.netAmount,
  });
}
