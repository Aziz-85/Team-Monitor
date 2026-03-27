/**
 * GET /api/analytics/performance?month=YYYY-MM&global=true&employees=true
 * Read-only analytics: pace, forecast, productivity (SalesEntry + targets).
 * New route — does not change existing APIs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { resolveBoutiqueIdsForRequest } from '@/lib/scope/ssot';
import { buildPerformanceAnalytics } from '@/lib/analytics/buildPerformanceAnalytics';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const monthParam = request.nextUrl.searchParams.get('month')?.trim();
  const employeesParam = request.nextUrl.searchParams.get('employees');
  const includeEmployees =
    employeesParam == null || employeesParam === '1' || employeesParam === 'true';

  const role = user.role as Role;

  if (role === 'EMPLOYEE') {
    const scope = await resolveMetricsScope(request);
    if (!scope?.effectiveBoutiqueId) {
      return NextResponse.json(
        { error: 'No boutique scope for analytics' },
        { status: 403 }
      );
    }
    const payload = await buildPerformanceAnalytics({
      boutiqueIds: [scope.effectiveBoutiqueId],
      monthKey: monthParam ?? undefined,
      userIdFilter: scope.userId,
      includeEmployees: false,
    });
    if (!payload) {
      return NextResponse.json({ error: 'No data' }, { status: 403 });
    }
    return NextResponse.json({
      scope: 'employee',
      ...payload,
    });
  }

  const boutiqueScope = await resolveBoutiqueIdsForRequest(request, {
    allowGlobal: true,
    modeName: 'ANALYTICS_PERFORMANCE',
  });
  if (!boutiqueScope?.boutiqueIds.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const empIdParam = request.nextUrl.searchParams.get('empId')?.trim();
  let userIdForEmp: string | null = null;
  if (empIdParam) {
    const u = await prisma.user.findFirst({
      where: { empId: empIdParam },
      select: { id: true },
    });
    if (!u?.id) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    userIdForEmp = u.id;
  }

  const payload = await buildPerformanceAnalytics({
    boutiqueIds: boutiqueScope.boutiqueIds,
    monthKey: monthParam ?? undefined,
    includeEmployees: userIdForEmp ? false : includeEmployees,
    userIdFilter: userIdForEmp,
  });
  if (!payload) {
    return NextResponse.json({ error: 'No data' }, { status: 403 });
  }

  return NextResponse.json({
    scope: boutiqueScope.isGlobal ? 'global' : 'operational',
    boutiqueIds: boutiqueScope.boutiqueIds,
    ...payload,
  });
}
