/**
 * GET /api/metrics/returns?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Canonical returns/exchange list for /sales/returns. Uses resolveMetricsScope; same scope as other metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseDateRiyadh, formatDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

function canAddManualReturn(role: Role): boolean {
  return (
    role === 'MANAGER' ||
    role === 'ASSISTANT_MANAGER' ||
    role === 'ADMIN' ||
    role === 'SUPER_ADMIN'
  );
}

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope for metrics' }, { status: 403 });
  }

  const fromParam = request.nextUrl.searchParams.get('from')?.trim();
  const toParam = request.nextUrl.searchParams.get('to')?.trim();
  const from = parseDateRiyadh(fromParam || '');
  const to = parseDateRiyadh(toParam || '');
  const fromDate = from.getTime() <= to.getTime() ? from : to;
  const toDate = from.getTime() <= to.getTime() ? to : from;

  const where: {
    boutiqueId: string;
    employeeId?: string;
    txnDate: { gte: Date; lte: Date };
    type: { in: ['RETURN', 'EXCHANGE'] };
  } = {
    boutiqueId: scope.effectiveBoutiqueId,
    txnDate: { gte: fromDate, lte: toDate },
    type: { in: ['RETURN', 'EXCHANGE'] },
  };
  if (scope.employeeOnly && scope.empId) where.employeeId = scope.empId;

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

  const items = rows.map((r) => ({
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
  }));

  return NextResponse.json({
    from: formatDateRiyadh(fromDate),
    to: formatDateRiyadh(toDate),
    items,
    canAdd: canAddManualReturn(scope.role),
  });
}
