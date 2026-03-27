export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { buildCompanyMonthContext } from '@/lib/company/companyMonthContext';
import { resolveCompanyBoutiqueIds } from '@/lib/company/companyScope';
import { buildCompanyBranchComparison } from '@/lib/company/buildCompanyBranchComparison';
import { deriveCompanyAlertsFromBranchRows } from '@/lib/company/buildCompanyAlerts';
import { buildCompanyOverview } from '@/lib/company/buildCompanyOverview';
import { normalizeMonthKey } from '@/lib/time';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const boutiqueIds = await resolveCompanyBoutiqueIds(user.role);
  const monthParam = request.nextUrl.searchParams.get('month');
  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam.trim())
      ? normalizeMonthKey(monthParam.trim())
      : undefined;
  const ctx = buildCompanyMonthContext(monthKey);
  const branchRows = await buildCompanyBranchComparison(boutiqueIds, ctx);
  const alerts = deriveCompanyAlertsFromBranchRows(branchRows, ctx);
  const overview = await buildCompanyOverview(boutiqueIds, ctx, {
    alertsPreview: alerts,
    branchRows,
  });

  return NextResponse.json(overview);
}
