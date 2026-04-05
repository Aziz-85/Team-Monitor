/**
 * GET /api/sales/analytics?asOf=YYYY-MM-DD&boutiqueId=
 * Production sales analytics for manager/executive view (SalesEntry + monthly targets).
 * RBAC: same family as /api/sales/summary/targets; scope via getSalesScope.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { buildSalesAnalyticsPayload } from '@/lib/sales-analytics/buildPayload';
import { getRiyadhNow, toRiyadhDateString } from '@/lib/time';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export async function GET(request: NextRequest) {
  const boutiqueIdParam = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const scopeResult = await getSalesScope({
    requestBoutiqueId: boutiqueIdParam || undefined,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  if (!ALLOWED_ROLES.includes(scope.role)) {
    return NextResponse.json(
      { error: 'Forbidden: sales analytics requires manager, admin, area manager, or super admin role.' },
      { status: 403 }
    );
  }

  let asOf = request.nextUrl.searchParams.get('asOf')?.trim() ?? '';
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    asOf = toRiyadhDateString(getRiyadhNow());
  }

  try {
    const payload = await buildSalesAnalyticsPayload(scope, asOf);
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVALID_DATE' || msg === 'INVALID_MONTH') {
      return NextResponse.json({ error: 'Invalid asOf date' }, { status: 400 });
    }
    if (msg === 'NO_BOUTIQUE') {
      return NextResponse.json({ error: 'No boutique in scope' }, { status: 403 });
    }
    console.error('[sales/analytics]', e);
    return NextResponse.json({ error: 'Failed to build analytics' }, { status: 500 });
  }
}
