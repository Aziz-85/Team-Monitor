/**
 * GET /api/metrics/my-target?month=YYYY-MM
 * Canonical target + MTD metrics for /me/target. Uses resolveMetricsScope + getTargetMetrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { formatMonthKey, normalizeMonthKey } from '@/lib/time';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getTargetMetrics } from '@/lib/metrics/aggregator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json(
      { error: 'Your account is not assigned to a boutique; target and sales are per-boutique' },
      { status: 403 }
    );
  }

  const now = new Date();
  const monthParam = request.nextUrl.searchParams.get('month')?.trim();
  const monthKey = normalizeMonthKey(monthParam || formatMonthKey(now));

  const metrics = await getTargetMetrics({
    boutiqueId: scope.effectiveBoutiqueId,
    userId: scope.userId,
    monthKey,
  });

  return NextResponse.json({
    monthKey: metrics.monthKey,
    monthTarget: metrics.monthTarget,
    boutiqueTarget: metrics.boutiqueTarget,
    todaySales: metrics.todaySales,
    weekSales: metrics.weekSales,
    mtdSales: metrics.mtdSales,
    dailyTarget: metrics.dailyTarget,
    weekTarget: metrics.weekTarget,
    remaining: metrics.remaining,
    pctDaily: metrics.pctDaily,
    pctWeek: metrics.pctWeek,
    pctMonth: metrics.pctMonth,
    daysInMonth: metrics.daysInMonth,
    todayStr: metrics.todayStr,
    todayInSelectedMonth: metrics.todayInSelectedMonth,
    weekRangeLabel: metrics.weekRangeLabel,
    leaveDaysInMonth: metrics.leaveDaysInMonth,
    presenceFactor: metrics.presenceFactor,
    scheduledDaysInMonth: metrics.scheduledDaysInMonth,
    month: metrics.monthKey,
    monthlyTarget: metrics.monthTarget,
    todayTarget: metrics.dailyTarget,
    mtdPct: metrics.pctMonth,
    todayPct: metrics.pctDaily,
    weekPct: metrics.pctWeek,
  });
}
