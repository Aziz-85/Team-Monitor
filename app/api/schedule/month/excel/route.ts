import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getScheduleMonthExcel } from '@/lib/services/scheduleMonthExcel';
import { canViewFullSchedule } from '@/lib/permissions';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'EMPLOYEE'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const month = request.nextUrl.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  const options: { empId?: string; boutiqueIds: string[] } = { boutiqueIds: scheduleScope.boutiqueIds };
  if (!canViewFullSchedule(user!.role) && user?.empId) {
    options.empId = user.empId;
  }

  const result = await getScheduleMonthExcel(month, options);
  const locale = request.nextUrl.searchParams.get('locale') || 'en';
  const loc = locale === 'ar' ? 'ar-SA' : 'en-GB';

  for (const day of result.days) {
    const d = new Date(day.date + 'T12:00:00Z');
    day.dowLabel = d.toLocaleDateString(loc, { weekday: 'short' });
  }
  for (const row of result.dayRows) {
    const d = new Date(row.date + 'T12:00:00Z');
    row.dowLabel = d.toLocaleDateString(loc, { weekday: 'short' });
  }

  return NextResponse.json(result);
}
