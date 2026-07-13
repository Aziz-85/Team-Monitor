/**
 * List recent canonical SalesEntry import batches (audit / rollback entry point).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';

export async function GET(request: NextRequest) {
  const scopeResult = await getSalesScope({ request });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;
  if (!['MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(scope.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const batches = await prisma.salesEntryImportBatch.findMany({
    where: {
      lines: {
        some: { boutiqueId: { in: scope.allowedBoutiqueIds } },
      },
    },
    take: 50,
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      source: true,
      fileName: true,
      fileSha256: true,
      uploadedAt: true,
      uploadedById: true,
      monthKey: true,
      importMode: true,
      status: true,
      _count: { select: { lines: true } },
    },
  });

  return NextResponse.json({ batches });
}
