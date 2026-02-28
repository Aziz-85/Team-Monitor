import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { lockDay, unlockDay, isDayLocked } from '@/lib/services/scheduleLock';
import { canLockUnlockDay as canLockUnlockDayPermission } from '@/lib/permissions';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import type { Role } from '@prisma/client';

const ROLES: Role[] = ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN'];

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canLockUnlockDayPermission(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const dateStr = String(body.date ?? '').trim();
  const reason = body.reason != null ? String(body.reason).trim() : null;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 });
  }

  const date = new Date(dateStr + 'T00:00:00Z');
  await lockDay(date, scheduleScope.boutiqueId, user.id, reason);

  await logAudit(
    user.id,
    'LOCK_DAY',
    'ScheduleLock',
    dateStr,
    null,
    JSON.stringify({ date: dateStr, reason }),
    reason ?? 'Day locked',
    { module: 'LOCK', targetDate: dateStr }
  );

  return NextResponse.json({ ok: true, date: dateStr, locked: true, reason });
}

export async function DELETE(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canLockUnlockDayPermission(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const dateStr = request.nextUrl.searchParams.get('date') ?? '';
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 });
  }

  const date = new Date(dateStr + 'T00:00:00Z');
  const wasLocked = await isDayLocked(date, scheduleScope.boutiqueId);
  await unlockDay(date, scheduleScope.boutiqueId, user.id);

  if (wasLocked) {
    await logAudit(
      user.id,
      'UNLOCK_DAY',
      'ScheduleLock',
      dateStr,
      JSON.stringify({ date: dateStr }),
      null,
      'Day unlocked',
      { module: 'LOCK', targetDate: dateStr }
    );
  }

  return NextResponse.json({ ok: true, date: dateStr, locked: false });
}
