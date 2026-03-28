/**
 * GET /api/performance/summary
 * Unified performance API: daily, weekly, monthly targets, sales, remaining, percent.
 * All values SAR_INT. Pace uses MTD SAR vs linear expectation (completed business days only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRiyadhNow, formatMonthKey } from '@/lib/time';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getPerformanceSummaryExtended } from '@/lib/metrics/aggregator';
import { computePaceMetrics } from '@/lib/analytics/performanceLayer';

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
  const paceDaysPassed = summary.paceDaysPassed ?? 0;
  const pace = computePaceMetrics({
    actualMTD: summary.monthly.sales,
    monthlyTarget: summary.monthly.target,
    totalDaysInMonth: daysInMonth,
    daysPassed: paceDaysPassed,
  });

  return NextResponse.json({
    monthKey: summary.monthKey,
    postedLastRecordedDateKey: summary.postedLastRecordedDateKey,
    postedLastRecordedDaySalesSar: summary.postedLastRecordedDaySalesSar,
    daily: summary.daily,
    weekly: summary.weekly,
    monthly: summary.monthly,
    pace: {
      expectedToDate: pace.expectedToDate,
      actualMtd: summary.monthly.sales,
      paceDelta: pace.paceDelta,
      band: pace.band,
      paceDaysPassed,
      daysInMonth,
    },
    hasSalesEntryForToday: summary.hasSalesEntryForToday,
    reportingDailyAllocationSar: summary.reportingDailyAllocationSar,
    reportingWeeklyAllocationSar: summary.reportingWeeklyAllocationSar,
    paceDailyRequiredSar: summary.paceDailyRequiredSar,
    paceWeeklyRequiredSar: summary.paceWeeklyRequiredSar,
    remainingMonthTargetSar: summary.remainingMonthTargetSar,
    paceDaysPassed,
    todayInSelectedMonth: summary.todayInSelectedMonth,
    dailyTrajectory: summary.dailyTrajectory,
    topSellers: summary.topSellers,
    daysInMonth,
    todayDayOfMonth: summary.todayDayOfMonth,
  });
}
