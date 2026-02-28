import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { lockWeek, unlockWeek, isWeekLocked } from '@/lib/services/scheduleLock';
import { canLockWeek, canUnlockWeek } from '@/lib/permissions';
import { getScheduleScope } from '@/lib/scope/scheduleScope';

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canLockWeek(user.role)) {
    return NextResponse.json({ error: 'Forbidden. Lock Week is Admin only.' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const weekStart = String(body.weekStart ?? '').trim();
  const reason = body.reason != null ? String(body.reason).trim() : null;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart (YYYY-MM-DD, Saturday) required' }, { status: 400 });
  }

  try {
    await lockWeek(weekStart, scheduleScope.boutiqueId, user.id, reason);
  } catch (e) {
    const err = e as Error;
    if (err.message === 'WEEK_NOT_APPROVED') {
      return NextResponse.json(
        { error: 'Week must be approved before it can be locked' },
        { status: 400 }
      );
    }
    throw e;
  }

  await logAudit(
    user.id,
    'LOCK_WEEK',
    'ScheduleLock',
    weekStart,
    null,
    JSON.stringify({ weekStart, reason }),
    reason ?? 'Week locked',
    { module: 'LOCK', weekStart }
  );

  return NextResponse.json({ ok: true, weekStart, locked: true });
}

export async function DELETE(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canUnlockWeek(user.role)) {
    return NextResponse.json({ error: 'Forbidden. Only ADMIN can unlock a week.' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const weekStart = request.nextUrl.searchParams.get('weekStart') ?? '';
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart (YYYY-MM-DD) required' }, { status: 400 });
  }

  const wasLocked = await isWeekLocked(weekStart, scheduleScope.boutiqueId);
  await unlockWeek(weekStart, scheduleScope.boutiqueId, user.id);

  if (wasLocked) {
    await logAudit(
      user.id,
      'UNLOCK_WEEK',
      'ScheduleLock',
      weekStart,
      JSON.stringify({ weekStart }),
      JSON.stringify({ statusRevertedTo: 'DRAFT' }),
      'Week unlocked, reverted to DRAFT',
      { module: 'LOCK', weekStart }
    );
  }

  return NextResponse.json({ ok: true, weekStart, locked: false });
}
