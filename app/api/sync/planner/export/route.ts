import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { exportSiteTasksForPeriod, exportRowsToCsv } from '@/lib/sync/exportSiteTasks';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const periodType = request.nextUrl.searchParams.get('periodType') as 'WEEK' | 'MONTH' | null;
  const periodKey = request.nextUrl.searchParams.get('periodKey') ?? '';
  if (!periodType || !['WEEK', 'MONTH'].includes(periodType) || !periodKey.trim()) {
    return NextResponse.json({ error: 'periodType (WEEK|MONTH) and periodKey required' }, { status: 400 });
  }

  try {
    const { rows } = await exportSiteTasksForPeriod(periodType, periodKey.trim(), scheduleScope.boutiqueId);
    const csv = exportRowsToCsv(rows);
    const filename = `site-export-${periodKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not approved') || msg.includes('Invalid periodKey')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
