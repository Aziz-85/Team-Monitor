/**
 * Executive Trends API — last N weeks. ADMIN + MANAGER only.
 * Scope resolved server-side; data filtered by boutiqueIds.
 * Query: n (default 4). Returns revenue, target, achievement%, overdue%, zone compliance% per week.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRiyadhNow, toRiyadhDateString } from '@/lib/time';
import { getLastNWeeksRanges } from '@/lib/executive/metrics';
import { fetchWeekMetrics } from '@/lib/executive/aggregation';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { resolveOperationalBoutiqueOnly } from '@/lib/scope/ssot';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'AREA_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await resolveOperationalBoutiqueOnly(request, user);
  if (!scopeResult.ok) return scopeResult.res;
  const boutiqueIds = scopeResult.scope.boutiqueIds;

  const nParam = request.nextUrl.searchParams.get('n');
  const n = Math.min(12, Math.max(1, parseInt(nParam ?? '4', 10) || 4));

  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const ranges = getLastNWeeksRanges(n, now);

  const series = await Promise.all(
    ranges.map((r) => fetchWeekMetrics(r.weekStart, todayStr, boutiqueIds))
  );

  const trends = series.map((raw) => {
    const achievementPct =
      raw.target > 0 ? calculatePerformance({ target: raw.target, sales: raw.revenue }).percent : 0;
    const overduePct =
      raw.taskTotal > 0 ? Math.round((raw.taskOverdue / raw.taskTotal) * 100) : 0;
    const zoneCompliancePct =
      raw.zoneTotal > 0
        ? Math.round((raw.zoneCompleted / raw.zoneTotal) * 100)
        : 100;
    return {
      weekStart: raw.weekStart,
      revenue: raw.revenue,
      target: raw.target,
      achievementPct,
      overduePct,
      zoneCompliancePct,
    };
  });

  return NextResponse.json({
    trends,
    weekStarts: trends.map((t) => t.weekStart),
  });
}
