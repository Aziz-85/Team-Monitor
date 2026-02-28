/**
 * POST /api/schedule/lock
 * Unified lock endpoint. Body: { scope: "DAY" | "WEEK", date?: "YYYY-MM-DD", weekStart?: "YYYY-MM-DD" }
 * DAY: ASSISTANT_MANAGER, MANAGER, ADMIN. WEEK: ADMIN only.
 * Sprint 2: Only APPROVED weeks can be WEEK-locked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { lockDay, lockWeek } from '@/lib/services/scheduleLock';
import { canLockUnlockDay, canLockWeek } from '@/lib/permissions';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import type { Role } from '@prisma/client';

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const scope = String(body.scope ?? '').toUpperCase();
  if (scope !== 'DAY' && scope !== 'WEEK') {
    return NextResponse.json({ error: 'scope must be DAY or WEEK' }, { status: 400 });
  }

  const reason = body.reason != null ? String(body.reason).trim() : null;

  if (scope === 'WEEK') {
    if (!canLockWeek(user.role)) {
      return NextResponse.json({ error: 'Forbidden. Lock Week is Admin only.' }, { status: 403 });
    }
    const weekStart = String(body.weekStart ?? '').trim();
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: 'weekStart (YYYY-MM-DD, Saturday) required for WEEK' }, { status: 400 });
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
    return NextResponse.json({ ok: true, scope: 'WEEK', weekStart, locked: true, reason });
  }

  if (!canLockUnlockDay(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const dateStr = String(body.date ?? '').trim();
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required for DAY' }, { status: 400 });
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
  return NextResponse.json({ ok: true, scope: 'DAY', date: dateStr, locked: true, reason });
}
