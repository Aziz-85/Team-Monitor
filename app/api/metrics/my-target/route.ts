/**
 * GET /api/metrics/my-target?month=YYYY-MM
 * Canonical target + MTD metrics for /me/target. Uses resolveMetricsScope + getTargetMetrics.
 * All amounts returned as SAR_INT (integer riyals). No scaling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRiyadhNow, formatMonthKey, normalizeMonthKey } from '@/lib/time';
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

  const now = getRiyadhNow();
  const monthParam = request.nextUrl.searchParams.get('month')?.trim();
  const monthKey = monthParam
    ? normalizeMonthKey(monthParam)
    : formatMonthKey(now);
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM (e.g. 2025-01)' }, { status: 400 });
  }

  const metrics = await getTargetMetrics({
    boutiqueId: scope.effectiveBoutiqueId,
    userId: scope.userId,
    monthKey,
    employeeCrossBoutique: scope.employeeOnly ?? false,
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
    reportingDailyAllocationSar: metrics.reportingDailyAllocationSar,
    reportingWeeklyAllocationSar: metrics.reportingWeeklyAllocationSar,
    paceDailyRequiredSar: metrics.paceDailyRequiredSar,
    paceWeeklyRequiredSar: metrics.paceWeeklyRequiredSar,
    remainingMonthTargetSar: metrics.remainingMonthTargetSar,
    remaining: metrics.remaining,
    pctDaily: metrics.pctDaily,
    pctWeek: metrics.pctWeek,
    pctMonth: metrics.pctMonth,
    daysInMonth: metrics.daysInMonth,
    todayStr: metrics.todayStr,
    todayInSelectedMonth: metrics.todayInSelectedMonth,
    dailyAchievementPending: metrics.dailyAchievementPending,
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
