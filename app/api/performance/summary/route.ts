/**
 * GET /api/performance/summary
 * Unified performance API: daily, weekly, monthly targets, sales, remaining, percent.
 * All values SAR_INT. Pace uses MTD SAR vs linear expectation (completed business days only).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRiyadhNow,
  formatMonthKey,
  toRiyadhDateString,
  getMonthRange,
  getWeekRangeForDate,
  intersectRanges,
} from '@/lib/time';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getPerformanceSummaryExtended } from '@/lib/metrics/aggregator';
import { computePaceMetrics, computeForecast } from '@/lib/analytics/performanceLayer';
import { prisma } from '@/lib/db';
import {
  buildWeekdayProfileFromHistory,
  buildSmartDowWeights,
  listRemainingDateKeysInMonth,
  computeSmartRequiredFromWeights,
  computeSmartForecastFromProfile,
} from '@/lib/analytics/smartBranchOutlook';
import { dateKeysForPaceWeekFrom } from '@/lib/targets/requiredPaceTargets';

export const dynamic = 'force-dynamic';

function addDaysToDateKeyUtc(dateKey: string, delta: number): string {
  const d = new Date(dateKey + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

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

  const linearForecast = computeForecast({
    actualMTD: summary.monthly.sales,
    monthlyTarget: summary.monthly.target,
    totalDaysInMonth: daysInMonth,
    daysPassed: paceDaysPassed,
  });

  let smartOutlook: {
    required: {
      smartDailyRequiredSar: number;
      smartWeeklyRequiredSar: number;
      linearDailyRequiredSar: number;
      linearWeeklyRequiredSar: number;
      usedEqualWeightFallback: boolean;
      explain: string;
    };
    forecast: {
      forecastSmartSar: number;
      projectedRemainingSmartSar: number;
      varianceVsTargetSar: number;
      confidence: 'high' | 'medium' | 'low';
      rangeConservativeSar: number;
      rangeExpectedSar: number;
      rangeStretchSar: number;
      linearForecastTotalSar: number;
      usedHistoryFallbackForForecast: boolean;
      explain: string;
    };
  } | null = null;

  if (!scope.employeeOnly && summary.todayInSelectedMonth && daysInMonth > 0) {
    const todayStr = toRiyadhDateString(getRiyadhNow());
    const historyEnd = addDaysToDateKeyUtc(todayStr, -1);
    const historyStart = addDaysToDateKeyUtc(historyEnd, -119);
    const histRows = await prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: {
        boutiqueId: effectiveBoutiqueId,
        dateKey: { gte: historyStart, lte: historyEnd },
      },
      _sum: { amount: true },
    });
    const historyDailyTotals = histRows.map((r) => ({
      dateKey: r.dateKey,
      amountSar: r._sum.amount ?? 0,
    }));
    const profile = buildWeekdayProfileFromHistory(historyDailyTotals);
    const { weightsBySatDow, usedEqualWeightFallback, explainWeights } = buildSmartDowWeights(profile);
    const remainingKeys = listRemainingDateKeysInMonth(monthKey, todayStr);
    const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);
    const todayDateOnly = new Date(todayStr + 'T00:00:00.000Z');
    const { startSat, endExclusiveFriPlus1 } = getWeekRangeForDate(todayDateOnly);
    const weekInMonth = intersectRanges(startSat, endExclusiveFriPlus1, monthStart, monthEnd);
    const weekRemainingKeys =
      weekInMonth != null ? dateKeysForPaceWeekFrom(monthKey, todayStr, weekInMonth.end) : [];

    const required = computeSmartRequiredFromWeights({
      remainingMonthTargetSar: summary.remainingMonthTargetSar,
      remainingDateKeysInMonth: remainingKeys,
      weekRemainingDateKeys: weekRemainingKeys,
      weightsBySatDow,
      usedEqualWeightFallback,
      explainWeights,
      linearDailyRequiredSar: summary.paceDailyRequiredSar,
      linearWeeklyRequiredSar: summary.paceWeeklyRequiredSar,
    });
    const forecast = computeSmartForecastFromProfile({
      actualMtdSar: summary.monthly.sales,
      monthlyTargetSar: summary.monthly.target,
      remainingDateKeysInMonth: remainingKeys,
      avgBySatDow: profile.avgBySatDow,
      usedEqualWeightFallback,
      totalHistorySampleDays: profile.totalSampleDays,
      paceDaysPassed: summary.paceDaysPassed,
      daysInMonth,
      linearForecastTotalSar: linearForecast.forecastedTotal,
    });
    smartOutlook = {
      required: {
        smartDailyRequiredSar: required.smartDailyRequiredSar,
        smartWeeklyRequiredSar: required.smartWeeklyRequiredSar,
        linearDailyRequiredSar: required.linearDailyRequiredSar,
        linearWeeklyRequiredSar: required.linearWeeklyRequiredSar,
        usedEqualWeightFallback: required.usedEqualWeightFallback,
        explain: required.explain,
      },
      forecast: {
        forecastSmartSar: forecast.forecastSmartSar,
        projectedRemainingSmartSar: forecast.projectedRemainingSmartSar,
        varianceVsTargetSar: forecast.varianceVsTargetSar,
        confidence: forecast.confidence,
        rangeConservativeSar: forecast.rangeConservativeSar,
        rangeExpectedSar: forecast.rangeExpectedSar,
        rangeStretchSar: forecast.rangeStretchSar,
        linearForecastTotalSar: forecast.linearForecastTotalSar,
        usedHistoryFallbackForForecast: forecast.usedHistoryFallbackForForecast,
        explain: forecast.explain,
      },
    };
  }

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
    linearForecast: {
      forecastedTotal: linearForecast.forecastedTotal,
      forecastDelta: linearForecast.forecastDelta,
      avgDailyActual: linearForecast.avgDailyActual,
    },
    smartOutlook,
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
