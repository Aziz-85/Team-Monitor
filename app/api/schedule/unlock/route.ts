/**
 * POST /api/schedule/unlock
 * Unified unlock endpoint. Body: { scope: "DAY" | "WEEK", date?: "YYYY-MM-DD", weekStart?: "YYYY-MM-DD" }
 * DAY: ASSISTANT_MANAGER, MANAGER, ADMIN. WEEK: ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { unlockDay, unlockWeek, isDayLocked, isWeekLocked } from '@/lib/services/scheduleLock';
import { canLockUnlockDay, canUnlockWeek } from '@/lib/permissions';
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

  if (scope === 'WEEK') {
    if (!canUnlockWeek(user.role)) {
      return NextResponse.json({ error: 'Forbidden. Only ADMIN can unlock a week.' }, { status: 403 });
    }
    const weekStart = String(body.weekStart ?? '').trim();
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: 'weekStart (YYYY-MM-DD) required for WEEK' }, { status: 400 });
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
        'Week unlocked',
        { module: 'LOCK', weekStart }
      );
    }
    return NextResponse.json({ ok: true, scope: 'WEEK', weekStart, locked: false });
  }

  if (!canLockUnlockDay(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const dateStr = String(body.date ?? '').trim();
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required for DAY' }, { status: 400 });
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
  return NextResponse.json({ ok: true, scope: 'DAY', date: dateStr, locked: false });
}
