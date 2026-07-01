import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import {
  swapWeeklyOffForWeek,
  SwapWeeklyOffError,
} from '@/lib/services/swapWeeklyOffForWeek';
import type { Role } from '@prisma/client';

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(EDIT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canEditSchedule(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  let body: {
    employeeId?: string;
    weekStart?: string;
    newOffDayOfWeek?: number;
    reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  const newOffDayOfWeek = Number(body.newOffDayOfWeek);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json(
      { error: 'employeeId and weekStart (YYYY-MM-DD) are required' },
      { status: 400 }
    );
  }

  try {
    const result = await swapWeeklyOffForWeek({
      boutiqueId: scheduleScope.boutiqueId,
      employeeId,
      weekStart,
      newOffDayOfWeek,
      reason: reason || 'Weekly off swap (this week only)',
      actorUserId: user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SwapWeeklyOffError) {
      const status =
        e.code === 'NOT_FOUND' ? 404 : e.code === 'LOCKED' ? 423 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    throw e;
  }
}
