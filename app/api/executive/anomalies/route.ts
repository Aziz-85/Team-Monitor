/**
 * Executive Anomalies API — non-anti-gaming anomalies. ADMIN + MANAGER only.
 * Query: n (default 4) weeks to analyze.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRiyadhNow, toRiyadhDateString } from '@/lib/time';
import { getLastNWeeksRanges, detectAnomalies, type TrendDataPoint } from '@/lib/executive/metrics';
import { fetchWeekMetrics } from '@/lib/executive/aggregation';
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

  const nParam = request.nextUrl.searchParams.get('n');
  const n = Math.min(8, Math.max(2, parseInt(nParam ?? '4', 10) || 4));

  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const ranges = getLastNWeeksRanges(n, now);

  const series = await Promise.all(
    ranges.map((r) => fetchWeekMetrics(r.weekStart, todayStr, boutiqueIds))
  );

  const trendSeries: TrendDataPoint[] = series.map((raw) => {
    const achievementPct =
      raw.target > 0 ? Math.round((raw.revenue / raw.target) * 100) : 0;
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

  const zoneDips: { zoneCode: string; compliancePct: number; weekStart: string }[] = [];
  for (const raw of series) {
    for (const z of raw.zoneByCode) {
      if (z.rate < 80) zoneDips.push({ zoneCode: z.zone, compliancePct: z.rate, weekStart: raw.weekStart });
    }
  }

  const anomalies = detectAnomalies({
    trendSeries,
    zoneDips: zoneDips.length > 0 ? zoneDips : undefined,
  });

  return NextResponse.json({
    anomalies,
    weekStarts: trendSeries.map((t) => t.weekStart),
  });
}
