/**
 * GET /api/targets/scope — Returns targets module scope for current user (boutiques, canEdit, canImport).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTargetsScope } from '@/lib/targets/scope';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scopeResult = await getTargetsScope(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  const boutiques = await prisma.boutique.findMany({
    where: { id: { in: scope.allowedBoutiqueIds }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  return NextResponse.json({
    canView: scope.canView,
    canEdit: scope.canEdit,
    canImport: scope.canImport,
    boutiques,
  });
}
