/**
 * Executive Insights API — one week summary with risk, narrative. ADMIN + MANAGER only.
 * Scope resolved server-side; data filtered by boutiqueIds.
 * Query: weekStart (YYYY-MM-DD, Saturday). Defaults to current week.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRiyadhNow, toRiyadhDateString } from '@/lib/time';
import { getWeekStart } from '@/lib/services/scheduleLock';
import {
  computeRiskIndex,
  computeRevenueMetrics,
  computeTaskMetrics,
  computeZoneCompliance,
  computeScheduleBalance,
  computeSalesRiskIndex,
  getRevenueTrendDirection,
  getTargetGapMomentum,
  getLastNWeeksRanges,
  linearRegressionProjection,
  volatilityIndex,
} from '@/lib/executive/metrics';
import { fetchWeekMetrics, fetchDailyRevenueForWeek } from '@/lib/executive/aggregation';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await resolveScopeForUser(user.id, role, null);
  const boutiqueIds = scope.boutiqueIds;
  if (boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No boutiques in scope' }, { status: 403 });
  }

  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const defaultWeekStart = getWeekStart(now);
  const weekStartParam = request.nextUrl.searchParams.get('weekStart');
  const weekStart =
    weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
      ? weekStartParam
      : defaultWeekStart;

  const [raw, prevWeekRaw, dailyRevenue, ...restWeeks] = await Promise.all([
    fetchWeekMetrics(weekStart, todayStr, boutiqueIds),
    (async () => {
      const prevSat = new Date(weekStart + 'T00:00:00Z');
      prevSat.setUTCDate(prevSat.getUTCDate() - 7);
      const prevStart = prevSat.toISOString().slice(0, 10);
      return fetchWeekMetrics(prevStart, todayStr, boutiqueIds);
    })(),
    fetchDailyRevenueForWeek(weekStart, boutiqueIds),
    ...getLastNWeeksRanges(4, new Date(weekStart + 'T12:00:00Z'))
      .slice(2, 4)
      .map((r) => fetchWeekMetrics(r.weekStart, todayStr, boutiqueIds)),
  ]);

  const last3WeeksRevenue = [raw.revenue, prevWeekRaw.revenue, restWeeks[0]?.revenue ?? 0];
  const revenueTrendDirection = getRevenueTrendDirection(last3WeeksRevenue);

  const gapThisWeek = Math.max(0, raw.target - raw.revenue);
  const gapPrevWeek = Math.max(0, prevWeekRaw.target - prevWeekRaw.revenue);
  const targetGapMomentum = getTargetGapMomentum(gapThisWeek, gapPrevWeek);

  const suspiciousPct =
    raw.taskTotal > 0 ? Math.round((raw.burstCount / raw.taskTotal) * 100) : 0;
  const disciplineScore = Math.max(0, 100 - suspiciousPct);

  const salesRisk = computeSalesRiskIndex({
    achievementPct: raw.target > 0 ? Math.round((raw.revenue / raw.target) * 100) : 0,
    revenueTrendDirection,
    targetGapMomentum,
    taskCompletionPct: raw.taskTotal > 0 ? Math.round((raw.taskCompleted / raw.taskTotal) * 100) : 100,
    zoneCompliancePct:
      raw.zoneTotal > 0 ? Math.round((raw.zoneCompleted / raw.zoneTotal) * 100) : 100,
    disciplineScore,
  });

  const fourWeekRevenues = [raw.revenue, prevWeekRaw.revenue, restWeeks[0]?.revenue ?? 0, restWeeks[1]?.revenue ?? 0];
  const movingAverage4 =
    fourWeekRevenues.reduce((a, b) => a + b, 0) / Math.max(1, fourWeekRevenues.length);
  const wowGrowthPct =
    prevWeekRaw.revenue > 0
      ? Math.round(((raw.revenue - prevWeekRaw.revenue) / prevWeekRaw.revenue) * 100)
      : 0;
  const dailyAmounts = dailyRevenue.map((d) => d.amount);
  const volIndex = volatilityIndex(dailyAmounts);
  const bestDay = dailyRevenue.length
    ? dailyRevenue.reduce((best, d) => (d.amount >= best.amount ? d : best), dailyRevenue[0])
    : null;
  const weakestDay = dailyRevenue.length
    ? dailyRevenue.reduce((worst, d) => (d.amount <= worst.amount ? d : worst), dailyRevenue[0])
    : null;
  const projectionNext2Weeks = linearRegressionProjection(fourWeekRevenues, 2);

  const revenueMetrics = computeRevenueMetrics({
    revenue: raw.revenue,
    target: raw.target,
  });
  const taskMetrics = computeTaskMetrics({
    completed: raw.taskCompleted,
    total: raw.taskTotal,
    overdue: raw.taskOverdue,
  });
  const zoneMetrics = computeZoneCompliance({
    completed: raw.zoneCompleted,
    total: raw.zoneTotal,
  });
  const scheduleMetrics = computeScheduleBalance({
    amCount: raw.amCount,
    pmCount: raw.pmCount,
  });

  const risk = computeRiskIndex({
    achievementPct: revenueMetrics.achievementPct,
    overduePct: taskMetrics.overduePct,
    suspiciousPct: raw.taskTotal > 0 ? Math.round((raw.burstCount / raw.taskTotal) * 100) : 0,
    scheduleBalancePct: scheduleMetrics.balancePct,
    zoneCompliancePct: zoneMetrics.compliancePct,
    weekStart,
  });

  const narrative = buildNarrative({
    risk,
    achievementPct: revenueMetrics.achievementPct,
    overduePct: taskMetrics.overduePct,
    zoneCompliancePct: zoneMetrics.compliancePct,
    scheduleBalancePct: scheduleMetrics.balancePct,
    weekStart,
  });

  return NextResponse.json({
    weekStart,
    weekEnd: raw.weekEnd,
    kpis: {
      revenue: raw.revenue,
      target: raw.target,
      achievementPct: revenueMetrics.achievementPct,
      overduePct: taskMetrics.overduePct,
      zoneCompliancePct: zoneMetrics.compliancePct,
      scheduleBalancePct: scheduleMetrics.balancePct,
      taskCompleted: raw.taskCompleted,
      taskTotal: raw.taskTotal,
    },
    risk: {
      score: risk.score,
      level: risk.level,
      reasons: risk.reasons,
    },
    salesRisk: {
      score: salesRisk.score,
      level: salesRisk.level,
      reasons: salesRisk.reasons,
    },
    revenueTrendDirection,
    targetGapMomentum,
    salesMomentum: {
      weekOverWeekGrowthPct: wowGrowthPct,
      movingAverage4Weeks: Math.round(movingAverage4),
      volatilityIndex: volIndex,
      bestPerformingDay: bestDay ? { dateStr: bestDay.dateStr, amount: bestDay.amount } : null,
      weakestPerformingDay: weakestDay ? { dateStr: weakestDay.dateStr, amount: weakestDay.amount } : null,
    },
    projectionNext2Weeks: projectionNext2Weeks.map((p) => ({
      weekOffset: p.weekOffset,
      projectedRevenue: p.projectedRevenue,
    })),
    topPerformers: raw.topPerformers,
    zoneByCode: raw.zoneByCode,
    narrative,
  });
}

function buildNarrative(params: {
  risk: { score: number; level: string; reasons: string[] };
  achievementPct: number;
  overduePct: number;
  zoneCompliancePct: number;
  scheduleBalancePct: number;
  weekStart: string;
}): {
  whatChanged: string[];
  why: string[];
  nextActions: string[];
} {
  const { risk, achievementPct, overduePct, zoneCompliancePct, scheduleBalancePct } = params;
  const whatChanged: string[] = [];
  const why: string[] = [];
  const nextActions: string[] = [];

  if (risk.reasons.length > 0 && !risk.reasons.includes('executive.risk.reasonNone')) {
    whatChanged.push('executive.narrative.riskFlagged');
    why.push(...risk.reasons);
    if (risk.level === 'HIGH') nextActions.push('executive.narrative.actionReviewUrgent');
    else if (risk.level === 'MED') nextActions.push('executive.narrative.actionReviewSoon');
  }

  if (achievementPct < 80) {
    whatChanged.push('executive.narrative.achievementLow');
    nextActions.push('executive.narrative.actionSalesTargets');
  }
  if (overduePct > 10) {
    whatChanged.push('executive.narrative.overdueHigh');
    nextActions.push('executive.narrative.actionTaskMonitor');
  }
  if (zoneCompliancePct < 80) {
    whatChanged.push('executive.narrative.zoneLow');
    nextActions.push('executive.narrative.actionZoneFollowUp');
  }
  if (scheduleBalancePct < 70) {
    whatChanged.push('executive.narrative.scheduleImbalance');
    nextActions.push('executive.narrative.actionScheduleBalance');
  }

  if (whatChanged.length === 0) {
    whatChanged.push('executive.narrative.noMaterialChange');
    nextActions.push('executive.narrative.actionContinueMonitor');
  }

  return { whatChanged, why, nextActions };
}
