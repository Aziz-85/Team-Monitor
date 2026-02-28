/**
 * Planner Export v2 – Power Automate–friendly CSV.
 * GET ?periodType=WEEK&periodKey=2026-W07
 * Fails with 400 if any task in scope has taskKey = null.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getPlannerV2RowsForWeek, plannerV2RowsToCsv } from '@/lib/sync/plannerExportV2';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const periodType = request.nextUrl.searchParams.get('periodType');
  const periodKey = request.nextUrl.searchParams.get('periodKey') ?? '';

  if (periodType !== 'WEEK' || !periodKey.trim()) {
    return NextResponse.json(
      { error: 'periodType=WEEK and periodKey required (e.g. 2026-W07)' },
      { status: 400 }
    );
  }

  if (!/^\d{4}-W\d{1,2}$/.test(periodKey.trim())) {
    return NextResponse.json(
      { error: 'periodKey must be YYYY-WNN (e.g. 2026-W07)' },
      { status: 400 }
    );
  }

  try {
    const { rows } = await getPlannerV2RowsForWeek(periodKey.trim(), scheduleScope.boutiqueId);
    const csv = plannerV2RowsToCsv(rows);
    const filename = `planner-export-${periodKey.trim()}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('missing taskKey') ||
      msg.includes('Export blocked') ||
      msg.includes('not approved') ||
      msg.includes('Invalid periodKey')
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
