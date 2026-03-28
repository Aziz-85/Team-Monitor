/**
 * GET /api/me/targets?month=YYYY-MM
 *
 * COMPATIBILITY WRAPPER — Canonical API is /api/metrics/my-target.
 * Same data, same logic (getTargetMetrics). Preserved for Employee Home and legacy consumers.
 * Uses employeeCrossBoutique when employeeOnly so employees see target/sales across all assigned boutiques.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getTargetMetrics } from '@/lib/metrics/aggregator';
import { formatMonthKey, normalizeMonthKey } from '@/lib/time';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await resolveMetricsScope(request);
  if (!scope?.effectiveBoutiqueId) {
    return NextResponse.json(
      { error: 'Your account is not assigned to a boutique; target and sales are per-boutique' },
      { status: 403 }
    );
  }

  const monthKey = normalizeMonthKey(request.nextUrl.searchParams.get('month')?.trim() || formatMonthKey(new Date()));

  const metrics = await getTargetMetrics({
    boutiqueId: scope.effectiveBoutiqueId,
    userId: scope.userId,
    monthKey,
    employeeCrossBoutique: scope.employeeOnly ?? true,
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
