/**
 * GET /api/performance/summary
 * Unified performance API: daily, weekly, monthly targets, sales, remaining, percent.
 * All values SAR_INT. Uses lib/performance/performanceEngine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRiyadhNow, formatMonthKey } from '@/lib/time';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getPerformanceSummaryExtended } from '@/lib/metrics/aggregator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope for performance' }, { status: 403 });
  }

  const now = getRiyadhNow();
  const monthKey = formatMonthKey(now);
  const boutiqueIdParam = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const effectiveBoutiqueId =
    boutiqueIdParam && (scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN')
      ? boutiqueIdParam
      : scope.effectiveBoutiqueId;

  const summary = await getPerformanceSummaryExtended({
    boutiqueId: effectiveBoutiqueId,
    userId: scope.employeeOnly ? scope.userId ?? undefined : undefined,
    monthKey,
    employeeOnly: scope.employeeOnly ?? false,
    employeeCrossBoutique: scope.employeeOnly ?? false,
  });

  const daysInMonth = summary.daysInMonth ?? 0;
  const todayDayOfMonth = summary.todayDayOfMonth ?? 0;
  const expectedPercent = daysInMonth > 0 ? Math.floor((todayDayOfMonth / daysInMonth) * 100) : 0;
  const actualPercent = summary.daily.percent;
  const deltaPercent = actualPercent - expectedPercent;

  return NextResponse.json({
    daily: summary.daily,
    weekly: summary.weekly,
    monthly: summary.monthly,
    pace: {
      expectedPercent,
      actualPercent,
      deltaPercent,
      status: deltaPercent >= 5 ? 'ahead' : deltaPercent >= -5 ? 'onpace' : 'behind',
    },
    dailyTrajectory: summary.dailyTrajectory,
    topSellers: summary.topSellers,
    daysInMonth,
    todayDayOfMonth,
  });
}
