/**
 * GET /api/metrics/reports/month-daily?month=YYYY-MM
 * Daily table (reporting allocation vs achieved per calendar day). Manager/Admin/Area/Super-admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  formatMonthKey,
  getDaysInMonth,
  getRiyadhNow,
  normalizeMonthKey,
} from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { buildOperationalPaceDailyRows } from '@/lib/reports/operationalPaceDailyTable';
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
  const daysInMonth = getDaysInMonth(monthKey);
  const [targetRow, salesByDate] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { boutiqueId, month: monthKey },
      select: { amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where: { boutiqueId, month: monthKey },
      _sum: { amount: true },
    }),
  ]);

  const monthTargetSar = targetRow?.amount ?? 0;
  const byKey = new Map(salesByDate.map((r) => [r.dateKey, r._sum.amount ?? 0]));
  const [y, m] = monthKey.split('-').map(Number);
  const mm = String(m).padStart(2, '0');

  const rows: Array<{
    dateKey: string;
    reportingDailyAllocationSar: number;
    achievedSar: number;
    remainingSar: number;
    achievementPct: number;
  }> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${y}-${mm}-${String(d).padStart(2, '0')}`;
    const allocation = getDailyTargetForDay(monthTargetSar, daysInMonth, d);
    const achieved = byKey.get(dateKey) ?? 0;
    const perf = calculatePerformance({ target: allocation, sales: achieved });
    rows.push({
      dateKey,
      reportingDailyAllocationSar: allocation,
      achievedSar: perf.sales,
      remainingSar: perf.remaining,
      achievementPct: perf.percent,
    });
  }

  const rowsOperational = buildOperationalPaceDailyRows({
    monthKey,
    monthTargetSar,
    daysInMonth,
    achievedByDateKey: byKey,
  });

  return NextResponse.json({
    kind: 'reporting_daily_month',
    labelNote:
      'Daily target values are reporting allocation (month spread across calendar days), not operational required pace.',
    labelNoteOperational:
      'Operational pace: base daily target is the same calendar spread as reporting; prior-day shortfall carries forward to the next day only. Remaining can be negative when the day beats its effective target (surplus).',
    monthKey,
    boutiqueId,
    monthTargetSar,
    rows,
    rowsOperational,
  });
}
