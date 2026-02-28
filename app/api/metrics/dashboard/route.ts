/**
 * GET /api/metrics/dashboard?boutiqueId= (optional)
 * Canonical metrics for dashboard: sales snapshot + breakdown. Uses resolveMetricsScope + getDashboardSalesMetrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRiyadhNow, formatMonthKey } from '@/lib/time';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getDashboardSalesMetrics } from '@/lib/metrics/aggregator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope for metrics' }, { status: 403 });
  }

  const now = getRiyadhNow();
  const monthKey = formatMonthKey(now);
  const boutiqueIdParam = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const effectiveBoutiqueId =
    boutiqueIdParam && (scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN')
      ? boutiqueIdParam
      : scope.effectiveBoutiqueId;

  const sales = await getDashboardSalesMetrics({
    boutiqueId: effectiveBoutiqueId,
    userId: scope.employeeOnly ? scope.userId : null,
    monthKey,
    employeeOnly: scope.employeeOnly,
  });

  return NextResponse.json({
    scope: { effectiveBoutiqueId, role: scope.role, employeeOnly: scope.employeeOnly },
    monthKey,
    sales: {
      currentMonthTarget: sales.currentMonthTarget,
      currentMonthActual: sales.currentMonthActual,
      completionPct: sales.completionPct,
      remainingGap: sales.remainingGap,
    },
    byUserId: sales.byUserId,
  });
}
