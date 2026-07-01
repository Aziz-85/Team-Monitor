import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canViewFullSchedule } from '@/lib/permissions';
import { getScheduleEmployeeWeekVisibility } from '@/lib/time';
import {
  buildScheduleFullExportWorkbook,
  canExportScheduleAudit,
} from '@/lib/services/scheduleFullExport';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const EXPORT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'EMPLOYEE'];

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(EXPORT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const weekStart = request.nextUrl.searchParams.get('weekStart')?.trim() ?? '';
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'Select a boutique in the scope selector.' }, { status: 403 });
  }

  if (!canViewFullSchedule(user!.role)) {
    const viewCheck = getScheduleEmployeeWeekVisibility(weekStart);
    if (!viewCheck.allowed) {
      return NextResponse.json(
        { error: viewCheck.reason ?? 'This week is not in your allowed view range.' },
        { status: 403 }
      );
    }
  }

  const empId = !canViewFullSchedule(user!.role) && user?.empId ? user.empId : undefined;

  try {
    const { buffer, weekEnd } = await buildScheduleFullExportWorkbook({
      weekStart,
      boutiqueIds: scheduleScope.boutiqueIds,
      coveringBoutiqueName: scheduleScope.label,
      empId,
      includeAudit: canExportScheduleAudit(user!.role),
    });

    const filename = `schedule-full-data-${weekStart}-to-${weekEnd}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[schedule/export/full]', err);
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
  }
}
