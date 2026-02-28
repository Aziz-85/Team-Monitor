import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { rosterForDate } from '@/lib/services/roster';
import { validateCoverage } from '@/lib/services/coverageValidation';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

/**
 * GET /api/schedule/insights/month?month=YYYY-MM
 * Returns monthly summary: AM vs PM trend, total Rashid coverage days (from overrides), top warning types.
 * Manager/Admin only. Scoped to resolved boutiqueIds.
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
  const scopeOptions = { boutiqueIds: scheduleScope.boutiqueIds };

  const monthParam = request.nextUrl.searchParams.get('month');
  if (!monthParam) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  const [y, m] = monthParam.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));

  const amVsPmTrend: Array<{ date: string; am: number; pm: number }> = [];
  const warningCounts: Record<string, number> = {};

  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateObj = new Date(d);
    const dateStr = dateObj.toISOString().slice(0, 10);
    const [roster, validations] = await Promise.all([
      rosterForDate(dateObj, scopeOptions),
      validateCoverage(dateObj, scopeOptions),
    ]);
    amVsPmTrend.push({
      date: dateStr,
      am: roster.amEmployees.length,
      pm: roster.pmEmployees.length,
    });
    for (const v of validations) {
      warningCounts[v.type] = (warningCounts[v.type] ?? 0) + 1;
    }
  }

  const scopeEmpIds = await prisma.employee
    .findMany({
      where: { boutiqueId: { in: scheduleScope.boutiqueIds }, active: true },
      select: { empId: true },
    })
    .then((rows) => rows.map((r) => r.empId));
  const rashidOverridesInMonth = await prisma.shiftOverride.count({
    where: {
      isActive: true,
      date: { gte: first, lte: last },
      overrideShift: { in: ['COVER_RASHID_AM', 'COVER_RASHID_PM'] },
      ...(scopeEmpIds.length > 0 ? { empId: { in: scopeEmpIds } } : {}),
    },
  });

  const topWarningTypes = Object.entries(warningCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  return NextResponse.json({
    month: monthParam,
    amVsPmTrend,
    totalRashidCoverageDays: rashidOverridesInMonth,
    topWarningTypes,
  });
}
