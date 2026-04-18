/**
 * GET /api/executive/month-snapshot?month=YYYY-MM
 * Read-only. Current-month snapshot from live SalesEntry (daily + staff).
 * Auth: same as other executive endpoints. Scope: active boutique only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadMonthSnapshotFromDb } from '@/lib/snapshots/loadMonthSnapshotFromDb';
import { requireExecutiveApiViewer } from '@/lib/executive/execAccess';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requireExecutiveApiViewer(request, user);
  if (!gate.ok) return gate.res;

  const boutique = await prisma.boutique.findUnique({
    where: { id: gate.scope.boutiqueId },
    select: { code: true },
  });
  if (!boutique?.code) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }

  const monthParam = request.nextUrl.searchParams.get('month');
  const now = new Date();
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const snapshot = await loadMonthSnapshotFromDb({
    boutiqueId: gate.scope.boutiqueId,
    branchCode: boutique.code,
    month,
  });

  if (!snapshot) {
    return NextResponse.json({ error: 'Invalid month' }, { status: 400 });
  }

  return NextResponse.json(snapshot);
}
