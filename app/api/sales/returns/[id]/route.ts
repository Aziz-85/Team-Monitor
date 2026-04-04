/**
 * PATCH /api/sales/returns/[id] — Update a manual RETURN/EXCHANGE (same RBAC as POST).
 * Body: type, txnDate, employeeId, amountSar, referenceNo?, originalTxnId?
 * Imported rows (importBatchId set or source !== MANUAL) cannot be edited here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { getTrustedOperationalBoutiqueId } from '@/lib/scope/operationalScope';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { formatDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { coverageForTxn } from '@/lib/coverageForTxn';
import { buildEmployeeWhereForOperational } from '@/lib/employee/employeeQuery';

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const id = (context.params?.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const scopeResult = await getSalesScope({
    requestBoutiqueId: undefined,
    requireManualReturn: true,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  const existing = await prisma.salesTransaction.findFirst({
    where: { id },
    select: {
      id: true,
      boutiqueId: true,
      employeeId: true,
      type: true,
      importBatchId: true,
      source: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.type !== 'RETURN' && existing.type !== 'EXCHANGE') {
    return NextResponse.json({ error: 'Not a return or exchange' }, { status: 400 });
  }
  if (existing.source !== 'MANUAL' || existing.importBatchId != null) {
    return NextResponse.json(
      { error: 'Only manually entered rows can be edited here' },
      { status: 403 }
    );
  }

  if (scope.allowedBoutiqueIds.length > 0 && !scope.allowedBoutiqueIds.includes(existing.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (scope.role === 'MANAGER') {
    const user = await getSessionUser();
    const trustedId = user ? await getTrustedOperationalBoutiqueId(user, request) : null;
    if (!trustedId || existing.boutiqueId !== trustedId) {
      return NextResponse.json({ error: 'Boutique not in your operational scope' }, { status: 403 });
    }
    const canManage = user
      ? await canManageSalesInBoutique(
          user.id,
          user.role as import('@prisma/client').Role,
          existing.boutiqueId,
          trustedId
        )
      : false;
    if (!canManage) {
      return NextResponse.json(
        { error: 'You do not have permission to manage sales for this boutique' },
        { status: 403 }
      );
    }
  }

  let body: {
    type?: string;
    txnDate?: string;
    employeeId?: string;
    amountSar?: number;
    referenceNo?: string;
    originalTxnId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const boutiqueId = existing.boutiqueId;

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

  const grossAmount = halalas;
  const netAmount = -halalas;

  const coverage = await coverageForTxn({
    boutiqueId,
    employeeId,
    txnDate,
  });

  const txn = await prisma.salesTransaction.update({
    where: { id },
    data: {
      txnDate,
      employeeId,
      type,
      referenceNo,
      grossAmount,
      netAmount,
      originalTxnId,
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
    referenceNo: txn.referenceNo,
    originalTxnId: txn.originalTxnId,
  });
}
