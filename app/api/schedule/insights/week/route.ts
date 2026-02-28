import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

/**
 * GET /api/schedule/insights/week?weekStart=YYYY-MM-DD
 * Returns weekly summary: avg AM/PM, days with violations, Rashid coverage count, most adjusted employee.
 * Manager/Admin only (or same as schedule view). Scoped to resolved boutiqueIds.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds: scheduleScope.boutiqueIds });
  const { days, counts } = grid;

  let totalAm = 0;
  let totalPm = 0;
  let totalRashidAm = 0;
  let totalRashidPm = 0;
  let daysWithViolations = 0;

  for (let i = 0; i < days.length; i++) {
    const c = counts[i] ?? { amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 };
    totalAm += c.amCount;
    totalPm += c.pmCount;
    totalRashidAm += c.rashidAmCount ?? 0;
    totalRashidPm += c.rashidPmCount ?? 0;
    const am = c.amCount;
    const pm = c.pmCount;
    const isFriday = days[i]?.dayOfWeek === 5;
    const minPm = days[i]?.minPm ?? 0;
    const effectiveMinPm = isFriday ? 0 : Math.max(minPm, 2);
    if (am > pm) daysWithViolations++;
    if (!isFriday && effectiveMinPm > 0 && pm < effectiveMinPm) daysWithViolations++;
    if (isFriday && am > 0) daysWithViolations++;
  }

  const numDays = days.length || 7;
  const avgAm = numDays ? Math.round((totalAm / numDays) * 10) / 10 : 0;
  const avgPm = numDays ? Math.round((totalPm / numDays) * 10) / 10 : 0;
  const rashidCoverageTotal = totalRashidAm + totalRashidPm;

  const start = new Date(weekStart + 'T00:00:00Z');
  const day = start.getUTCDay();
  const daysBack = (day - 6 + 7) % 7;
  start.setUTCDate(start.getUTCDate() - daysBack);
  const weekEnd = new Date(start);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const scopeEmpIds = grid.rows.map((r) => r.empId);
  const overridesInWeek = await prisma.shiftOverride.groupBy({
    by: ['empId'],
    where: {
      isActive: true,
      date: { gte: start, lte: weekEnd },
      ...(scopeEmpIds.length > 0 ? { empId: { in: scopeEmpIds } } : {}),
    },
    _count: { id: true },
  });

  const sorted = overridesInWeek.sort((a, b) => b._count.id - a._count.id);
  const mostAdjusted = sorted[0]
    ? await prisma.employee.findUnique({ where: { empId: sorted[0].empId }, select: { empId: true, name: true } }).then((e) => ({
        empId: sorted[0].empId,
        name: e?.name ?? sorted[0].empId,
        overrideCount: sorted[0]._count.id,
      }))
    : null;

  return NextResponse.json({
    weekStart,
    avgAm,
    avgPm,
    daysWithViolations,
    rashidCoverageTotal,
    mostAdjustedEmployee: mostAdjusted,
  });
}
