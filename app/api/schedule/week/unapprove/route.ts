/**
 * POST /api/schedule/week/unapprove
 * Revert week to DRAFT; clear approval metadata. ADMIN only. Week must not be locked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { unapproveWeek } from '@/lib/services/scheduleLock';
import { getScheduleScope } from '@/lib/scope/scheduleScope';

function isSaturday(weekStart: string): boolean {
  const d = new Date(weekStart + 'T00:00:00Z');
  return d.getUTCDay() === 6;
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden. Only ADMIN can unapprove a week.' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const weekStart = String(body.weekStart ?? '').trim();
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart (YYYY-MM-DD, Saturday) required' }, { status: 400 });
  }
  if (!isSaturday(weekStart)) {
    return NextResponse.json({ error: 'weekStart must be a Saturday' }, { status: 400 });
  }

  try {
    await unapproveWeek(weekStart, scheduleScope.boutiqueId);
  } catch (e) {
    const err = e as Error;
    if (err.message === 'WEEK_LOCKED') {
      return NextResponse.json(
        { error: 'Cannot unapprove a locked week. Unlock the week first.' },
        { status: 400 }
      );
    }
    throw e;
  }

  await logAudit(
    user.id,
    'WEEK_UNAPPROVED',
    'ScheduleWeekStatus',
    weekStart,
    JSON.stringify({ status: 'APPROVED' }),
    JSON.stringify({ status: 'DRAFT' }),
    'Week unapproved',
    { module: 'SCHEDULE', weekStart }
  );

  return NextResponse.json({ ok: true, weekStart, status: 'DRAFT' });
}
