/**
 * GET /api/sales/import-issues?batchId=...
 * RBAC: MANAGER/ADMIN (any batch they can access); ASSISTANT_MANAGER read-only for active boutique; EMPLOYEE: 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';

export async function GET(request: NextRequest) {
  const scopeResult = await getSalesScope({ request });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  if (scope.employeeOnly) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const batchId = request.nextUrl.searchParams.get('batchId')?.trim();
  if (!batchId) {
    return NextResponse.json({ error: 'batchId required' }, { status: 400 });
  }

  const batch = await prisma.salesLedgerBatch.findUnique({
    where: { id: batchId },
    select: { id: true, boutiqueId: true },
  });
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  if (scope.role !== 'ADMIN' && !scope.allowedBoutiqueIds.includes(batch.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const issues = await prisma.importIssue.findMany({
    where: { batchId },
    orderBy: [{ severity: 'asc' }, { rowIndex: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({ batchId, issues });
}
