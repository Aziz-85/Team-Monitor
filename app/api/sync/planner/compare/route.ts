import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getSiteStateForPeriod } from '@/lib/sync/siteState';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { parsePlannerFile, parsePlannerCsv, runCompare } from '@/lib/sync/comparePlanner';
import { flagBursts, flagSameDayBulk, mergeFlags } from '@/lib/sync/antiGaming';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN'];

export async function POST(request: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let periodType: 'WEEK' | 'MONTH' = 'WEEK';
  let periodKey = '';
  let plannerRows: Awaited<ReturnType<typeof parsePlannerCsv>>;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const periodTypeVal = formData.get('periodType');
    const periodKeyVal = formData.get('periodKey');
    const file = formData.get('plannerFile');
    periodType = periodTypeVal === 'MONTH' ? 'MONTH' : 'WEEK';
    periodKey = String(periodKeyVal ?? '').trim();
    if (!periodKey || !file || !(file instanceof File)) {
      return NextResponse.json({ error: 'periodKey and plannerFile required' }, { status: 400 });
    }
    const buffer = await file.arrayBuffer();
    plannerRows = parsePlannerFile(buffer, file.name);
  } else {
    let body: { periodType?: string; periodKey?: string; plannerCsv?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON body or multipart form with periodKey and plannerFile required' }, { status: 400 });
    }
    periodType = body.periodType === 'MONTH' ? 'MONTH' : 'WEEK';
    periodKey = String(body.periodKey ?? '').trim();
    const plannerCsv = String(body.plannerCsv ?? '').trim();
    if (!periodKey || !plannerCsv) {
      return NextResponse.json({ error: 'periodKey and plannerCsv required' }, { status: 400 });
    }
    plannerRows = parsePlannerCsv(plannerCsv);
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  try {
    const siteState = await getSiteStateForPeriod(periodType, periodKey, scheduleScope.boutiqueId);
    const burstFlags = flagBursts(plannerRows);
    const sameDayFlags = flagSameDayBulk(plannerRows);
    const merged = mergeFlags(burstFlags, sameDayFlags);
    const rowFlags = new Map<number, Record<string, unknown>>();
    for (const [i, flags] of Array.from(merged)) {
      rowFlags.set(i, { flags });
    }
    const result = runCompare(siteState, plannerRows, rowFlags);
    return NextResponse.json({
      compare: result,
      siteStateCount: siteState.length,
      plannerRowCount: plannerRows.length,
      suspiciousCount: result.suspicious.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
