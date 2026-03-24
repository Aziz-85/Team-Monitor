import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getScheduleMonthExcel } from '@/lib/services/scheduleMonthExcel';
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
  const monthParam = request.nextUrl.searchParams.get('month');
  if (!monthParam) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  /**
   * Unified month source of truth:
   * - `/api/schedule/month/excel`
   * - `/api/schedule/month`
   * Both now derive from `getScheduleMonthExcel` (which uses week grid service).
   */
  const result = await getScheduleMonthExcel(monthParam, { boutiqueIds: scheduleScope.boutiqueIds });
  const days = result.dayRows.map((r) => ({
    date: r.date,
    amCount: r.amCount,
    pmCount: r.pmCount,
    warnings: r.warnings,
  }));

  return NextResponse.json({ month: monthParam, days });
}
