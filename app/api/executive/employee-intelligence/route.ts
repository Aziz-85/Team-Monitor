/**
 * GET /api/executive/employee-intelligence?weekStart=YYYY-MM-DD
 * Returns per-employee revenue intelligence: MTD, target, achievement %, 3-week trend,
 * consistency, ERS score + label + reasons. Sorted by ERS (best first). ADMIN + MANAGER only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRiyadhNow } from '@/lib/time';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { prisma } from '@/lib/db';
import {
  getLastNWeeksRanges,
  getRevenueTrendDirection,
  weeklyRevenueConsistencyScore,
  computeEmployeeRevenueScore,
  type ERSLevel,
} from '@/lib/executive/metrics';
import { getRevenueFromSalesLinesByEmpId } from '@/lib/executive/salesLineRevenue';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

export type EmployeeIntelligenceRow = {
  userId: string;
  name: string;
  revenueWTD: number;
  revenueMTD: number;
  employeeMonthlyTarget: number;
  achievementPercent: number;
  trend: 'uptrend' | 'flat' | 'downtrend';
  consistency: number;
  ersScore: number;
  ersLabel: ERSLevel;
  reasons: string[];
};

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

  const boutiqueFilter = { boutiqueId: { in: boutiqueIds } };
  const now = getRiyadhNow();
  const defaultWeekStart = getWeekStart(now);
  const weekStartParam = request.nextUrl.searchParams.get('weekStart');
  const weekStart =
    weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
      ? weekStartParam
      : defaultWeekStart;

  const monthKey = weekStart.slice(0, 7);
  const ranges = getLastNWeeksRanges(3, new Date(weekStart + 'T12:00:00Z'));
  const weekEnd = ranges[0].weekEnd;
  const weekStartDate = new Date(weekStart + 'T00:00:00Z');
  const weekEndDate = new Date(weekEnd + 'T00:00:00Z');
  const monthStartDate = new Date(monthKey + '-01T00:00:00Z');

  const targets = await prisma.employeeMonthlyTarget.findMany({
    where: { month: monthKey, ...boutiqueFilter },
    include: {
      user: {
        select: {
          id: true,
          employee: { select: { name: true } },
          empId: true,
        },
      },
    },
  });

  const usersForMap = targets.map((t) => ({ id: t.userId, empId: t.user.empId }));
  const [mtdByEmpId, wtdByEmpId, w1ByEmpId, w2ByEmpId, w3ByEmpId] = await Promise.all([
    getRevenueFromSalesLinesByEmpId(boutiqueIds, monthStartDate, weekEndDate),
    getRevenueFromSalesLinesByEmpId(boutiqueIds, weekStartDate, weekEndDate),
    getRevenueFromSalesLinesByEmpId(
      boutiqueIds,
      new Date(ranges[0].weekStart + 'T00:00:00Z'),
      new Date(ranges[0].weekEnd + 'T00:00:00Z')
    ),
    getRevenueFromSalesLinesByEmpId(
      boutiqueIds,
      new Date(ranges[1].weekStart + 'T00:00:00Z'),
      new Date(ranges[1].weekEnd + 'T00:00:00Z')
    ),
    getRevenueFromSalesLinesByEmpId(
      boutiqueIds,
      new Date(ranges[2].weekStart + 'T00:00:00Z'),
      new Date(ranges[2].weekEnd + 'T00:00:00Z')
    ),
  ]);

  const toUserIdMap = (byEmpId: Map<string, number>) =>
    new Map(usersForMap.map((u) => [u.id, byEmpId.get(u.empId) ?? 0]));
  const mtdMap = toUserIdMap(mtdByEmpId);
  const wtdMap = toUserIdMap(wtdByEmpId);
  const w1Map = toUserIdMap(w1ByEmpId);
  const w2Map = toUserIdMap(w2ByEmpId);
  const w3Map = toUserIdMap(w3ByEmpId);

  const rows: EmployeeIntelligenceRow[] = targets.map((t) => {
    const revenueWTD = wtdMap.get(t.userId) ?? 0;
    const revenueMTD = mtdMap.get(t.userId) ?? 0;
    const target = t.amount;
    const achievementPercent =
      target > 0 ? Math.round((revenueMTD / target) * 100) : 0;
    const last3Weeks = [
      w1Map.get(t.userId) ?? 0,
      w2Map.get(t.userId) ?? 0,
      w3Map.get(t.userId) ?? 0,
    ];
    const trend = getRevenueTrendDirection(last3Weeks);
    const consistency = weeklyRevenueConsistencyScore(last3Weeks);
    const ers = computeEmployeeRevenueScore({
      achievementPct: achievementPercent,
      revenueTrendDirection: trend,
      consistencyScore: consistency,
    });
    const name =
      t.user?.employee?.name ?? t.user?.empId ?? t.userId;
    return {
      userId: t.userId,
      name,
      revenueWTD,
      revenueMTD,
      employeeMonthlyTarget: target,
      achievementPercent,
      trend,
      consistency,
      ersScore: ers.score,
      ersLabel: ers.label,
      reasons: ers.reasons,
    };
  });

  rows.sort((a, b) => b.ersScore - a.ersScore);

  return NextResponse.json({
    weekStart,
    weekEnd,
    monthKey,
    employees: rows,
  });
}
