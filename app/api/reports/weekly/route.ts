/**
 * GET /api/reports/weekly?weekStart=YYYY-MM-DD&boutiqueId=optional
 * Sat-start Riyadh week report (boutique + employees + daily). Manager / admin scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { formatDateRiyadh, getRiyadhNow, getWeekRangeForDate } from '@/lib/time';
import { getWeeklyReport, WeeklyReportError } from '@/lib/reports/weeklyReportService';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

function defaultWeekStartSaturday(): string {
  const { startSat } = getWeekRangeForDate(getRiyadhNow());
  return formatDateRiyadh(startSat);
}

export async function GET(request: NextRequest) {
  const scope = await resolveMetricsScope(request);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'No boutique scope' }, { status: 403 });
  }
  if (!ROLES.includes(scope.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const qBoutique = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  if (qBoutique && qBoutique !== scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'Boutique mismatch' }, { status: 403 });
  }

  const boutiqueId = scope.effectiveBoutiqueId;
  const weekParam = request.nextUrl.searchParams.get('weekStart')?.trim();
  const weekStart = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : defaultWeekStartSaturday();

  try {
    const report = await getWeeklyReport(boutiqueId, weekStart, prisma);
    const boutiqueRow = await prisma.boutique.findUnique({
      where: { id: boutiqueId },
      select: { name: true, code: true },
    });
    const boutiqueName = boutiqueRow ? `${boutiqueRow.name} (${boutiqueRow.code})` : undefined;

    return NextResponse.json({
      weekNumber: report.weekNumber,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      boutiqueId: report.boutiqueId,
      boutiqueName,
      boutique: report.boutique,
      employees: report.employees,
      days: report.days,
      insights: report.insights,
    });
  } catch (e) {
    if (e instanceof WeeklyReportError && e.code === 'INVALID_WEEK_START') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
