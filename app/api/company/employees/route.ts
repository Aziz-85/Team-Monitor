export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { buildCompanyMonthContext } from '@/lib/company/companyMonthContext';
import { resolveCompanyBoutiqueIds } from '@/lib/company/companyScope';
import { buildCompanyEmployees } from '@/lib/company/buildCompanyEmployees';
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
  const employees = await buildCompanyEmployees(boutiqueIds, ctx);

  return NextResponse.json({ monthKey: ctx.monthKey, employees });
}
