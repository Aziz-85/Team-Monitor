/**
 * GET /api/metrics/reports/week?month=YYYY-MM
 * Boutique + per-employee weekly snapshot: reporting week allocation, operational pace required,
 * achieved week MTD, percents. Riyadh Sat–Fri week intersected with month. Manager/Admin/Area/Super-admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  formatMonthKey,
  getDaysInMonth,
  getMonthRange,
  getRiyadhNow,
  getWeekRangeForDate,
  intersectRanges,
  normalizeMonthKey,
  toRiyadhDateString,
} from '@/lib/time';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { computeReportingAndPaceSnapshot } from '@/lib/targets/requiredPaceTargets';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope' }, { status: 403 });
  }
  if (!ROLES.includes(scope.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const monthKey = normalizeMonthKey(
    request.nextUrl.searchParams.get('month')?.trim() || formatMonthKey(getRiyadhNow())
  );
  const boutiqueId = scope.effectiveBoutiqueId;
  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const todayDateOnly = new Date(todayStr + 'T00:00:00.000Z');
  const daysInMonth = getDaysInMonth(monthKey);
  const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);
  const { startSat, endExclusiveFriPlus1 } = getWeekRangeForDate(todayDateOnly);
  const weekInMonth = intersectRanges(startSat, endExclusiveFriPlus1, monthStart, monthEnd);
  const todayInSelectedMonth = normalizeMonthKey(monthKey) === normalizeMonthKey(formatMonthKey(now));
  const todayDayOfMonth = todayDateOnly.getUTCDate();

  if (!weekInMonth) {
    return NextResponse.json({ error: 'Selected month does not overlap current Riyadh week' }, { status: 400 });
  }

  const [
    boutiqueTarget,
    employeeTargets,
    mtdBoutiqueAgg,
    weekBoutiqueAgg,
    mtdByUser,
    weekByUser,
  ] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { boutiqueId, month: monthKey },
      select: { amount: true },
    }),
    prisma.employeeMonthlyTarget.findMany({
      where: { boutiqueId, month: monthKey },
      include: {
        user: {
          select: {
            id: true,
            empId: true,
            employee: { select: { name: true } },
          },
        },
      },
    }),
    prisma.salesEntry.aggregate({
      where: { boutiqueId, month: monthKey, dateKey: { lte: todayStr } },
      _sum: { amount: true },
    }),
    prisma.salesEntry.aggregate({
      where: {
        boutiqueId,
        date: { gte: weekInMonth.start, lt: weekInMonth.end },
      },
      _sum: { amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where: { boutiqueId, month: monthKey, dateKey: { lte: todayStr } },
      _sum: { amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where: {
        boutiqueId,
        date: { gte: weekInMonth.start, lt: weekInMonth.end },
      },
      _sum: { amount: true },
    }),
  ]);

  const monthTargetSar = boutiqueTarget?.amount ?? 0;
  const mtdBoutique = mtdBoutiqueAgg._sum.amount ?? 0;
  const weekAchievedBoutique = weekBoutiqueAgg._sum.amount ?? 0;
  const mtdMap = new Map(mtdByUser.map((r) => [r.userId, r._sum.amount ?? 0]));
  const weekMap = new Map(weekByUser.map((r) => [r.userId, r._sum.amount ?? 0]));

  const boutiqueSnap = computeReportingAndPaceSnapshot({
    monthTarget: monthTargetSar,
    mtdAchieved: mtdBoutique,
    daysInMonth,
    monthKey,
    todayDateKey: todayStr,
    todayDayOfMonth,
    todayInSelectedMonth,
    weekInMonth,
  });

  const weekReportingBoutique = boutiqueSnap.reportingWeeklyAllocationSar;
  const weekPerfBoutiqueReporting = calculatePerformance({
    target: weekReportingBoutique,
    sales: weekAchievedBoutique,
  });
  const weekPerfBoutiquePace = calculatePerformance({
    target: boutiqueSnap.paceWeeklyRequiredSar,
    sales: weekAchievedBoutique,
  });

  const employees = employeeTargets.map((et) => {
    const empMtd = mtdMap.get(et.userId) ?? 0;
    const empWeek = weekMap.get(et.userId) ?? 0;
    const empSnap = computeReportingAndPaceSnapshot({
      monthTarget: et.amount,
      mtdAchieved: empMtd,
      daysInMonth,
      monthKey,
      todayDateKey: todayStr,
      todayDayOfMonth,
      todayInSelectedMonth,
      weekInMonth,
    });
    const wRep = calculatePerformance({
      target: empSnap.reportingWeeklyAllocationSar,
      sales: empWeek,
    });
    const wPace = calculatePerformance({
      target: empSnap.paceWeeklyRequiredSar,
      sales: empWeek,
    });
    return {
      userId: et.userId,
      empId: et.user.empId,
      name: et.user.employee?.name ?? et.user.empId,
      monthlyTargetSar: et.amount,
      mtdAchievedSar: empMtd,
      remainingMonthTargetSar: empSnap.remainingMonthTargetSar,
      weekAchievedSar: empWeek,
      reportingWeeklyAllocationSar: empSnap.reportingWeeklyAllocationSar,
      reportingWeeklyRemainingSar: wRep.remaining,
      reportingWeeklyAchievementPct: wRep.percent,
      paceWeeklyRequiredSar: empSnap.paceWeeklyRequiredSar,
      paceWeeklyRemainingSar: wPace.remaining,
      paceWeeklyAchievementPct: wPace.percent,
    };
  });

  return NextResponse.json({
    kind: 'week_target_report',
    labelNote:
      'reportingWeekly* = calendar allocation for days in this Riyadh week; paceWeekly* = operational required sum for remaining week days based on remaining monthly target.',
    monthKey,
    todayStr,
    boutiqueId,
    boutique: {
      monthTargetSar,
      mtdAchievedSar: mtdBoutique,
      remainingMonthTargetSar: boutiqueSnap.remainingMonthTargetSar,
      weekAchievedSar: weekAchievedBoutique,
      reportingWeeklyAllocationSar: weekReportingBoutique,
      reportingWeeklyRemainingSar: weekPerfBoutiqueReporting.remaining,
      reportingWeeklyAchievementPct: weekPerfBoutiqueReporting.percent,
      paceWeeklyRequiredSar: boutiqueSnap.paceWeeklyRequiredSar,
      paceWeeklyRemainingSar: weekPerfBoutiquePace.remaining,
      paceWeeklyAchievementPct: weekPerfBoutiquePace.percent,
    },
    employees,
  });
}
