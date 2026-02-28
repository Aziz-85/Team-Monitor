import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { rosterForDate } from '@/lib/services/roster';
import { validateCoverage } from '@/lib/services/coverageValidation';
import type { Role } from '@prisma/client';

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
  const rosterOptions = { boutiqueIds: scheduleScope.boutiqueIds };
  const coverageOptions = { boutiqueIds: scheduleScope.boutiqueIds };

  const monthParam = request.nextUrl.searchParams.get('month');
  if (!monthParam) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  const [y, m] = monthParam.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const days: Array<{
    date: string;
    amCount: number;
    pmCount: number;
    warnings: string[];
    coverageValidation: Awaited<ReturnType<typeof validateCoverage>>;
  }> = [];

  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateObj = new Date(d);
    const [roster, coverageValidation] = await Promise.all([
      rosterForDate(dateObj, rosterOptions),
      validateCoverage(dateObj, coverageOptions),
    ]);
    const warnings = coverageValidation.map((r) => r.message);
    days.push({
      date: dateObj.toISOString().slice(0, 10),
      amCount: roster.amEmployees.length,
      pmCount: roster.pmEmployees.length,
      warnings,
      coverageValidation,
    });
  }

  return NextResponse.json({ month: monthParam, days });
}
