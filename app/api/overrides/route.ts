import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { createOrExecuteApproval } from '@/lib/services/approvals';
import { applyOverrideChange } from '@/lib/services/scheduleApply';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { requiresApproval } from '@/lib/permissions';
import { isAmShiftForbiddenOnDate } from '@/lib/services/shift';
import { API_ERROR_MESSAGES } from '@/lib/validationErrors';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import { prisma } from '@/lib/db';
import { emitEventAsync } from '@/lib/notify/emitEvent';
import type { Role } from '@prisma/client';

const ALLOWED_SHIFTS = ['MORNING', 'EVENING', 'NONE', 'COVER_RASHID_AM', 'COVER_RASHID_PM'] as const;

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const empId = String(body.empId ?? '');
  const dateStr = String(body.date ?? '');
  const overrideShift = String(body.overrideShift ?? 'NONE').toUpperCase();
  const reason = String(body.reason ?? '').trim();

  if (!empId || !dateStr) {
    return NextResponse.json({ error: API_ERROR_MESSAGES.EMPID_DATE_REQUIRED }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  }

  let boutiqueId: string;
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    const scheduleScope = await getScheduleScope(request);
    if (!scheduleScope?.boutiqueId) {
      return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
    }
    boutiqueId = scheduleScope.boutiqueId;
  } else {
    const { scope, res } = await requireOperationalScope(request);
    if (res) return res;
    boutiqueId = scope.boutiqueId;
  }

  // Allow both same-boutique and external-branch employees (guest coverage)
  const emp = await prisma.employee.findFirst({
    where: { empId, active: true, isSystemOnly: false },
    select: { empId: true, boutiqueId: true },
  });
  if (!emp) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  try {
    await assertScheduleEditable({ dates: [dateStr], boutiqueId });
  } catch (e) {
    if (e instanceof ScheduleLockedError) {
      const lockInfo = e.lockInfo;
      const message = lockInfo?.reason
        ? `${e.message}. Reason: ${lockInfo.reason}`
        : e.message;
      return NextResponse.json(
        {
          error: message,
          code: e.code,
          lock: lockInfo
            ? {
                scope: lockInfo.scopeType,
                date: lockInfo.scopeValue,
                reason: lockInfo.reason,
                lockedBy: lockInfo.lockedByUserId,
                lockedAt: lockInfo.lockedAt.toISOString(),
              }
            : undefined,
        },
        { status: 423 }
      );
    }
    throw e;
  }
  if (!ALLOWED_SHIFTS.includes(overrideShift as (typeof ALLOWED_SHIFTS)[number])) {
    return NextResponse.json({ error: API_ERROR_MESSAGES.OVERRIDE_SHIFT_INVALID }, { status: 400 });
  }

  const date = new Date(dateStr + 'T00:00:00Z');
  if (isAmShiftForbiddenOnDate(date, overrideShift as 'MORNING' | 'COVER_RASHID_AM')) {
    return NextResponse.json({ error: API_ERROR_MESSAGES.FRIDAY_PM_ONLY, code: 'FRIDAY_PM_ONLY' }, { status: 400 });
  }

  const payload = { empId, date: dateStr, overrideShift, reason, sourceBoutiqueId: emp.boutiqueId };
  const weekStart = getWeekStart(date);

  if (requiresApproval(user.role)) {
    if (!boutiqueId) {
      return NextResponse.json(
        { error: 'No schedule scope (boutique) for this request. Please select a scope and try again.' },
        { status: 403 }
      );
    }
    const result = await createOrExecuteApproval({
      user,
      module: 'SCHEDULE',
      actionType: 'OVERRIDE_CREATE',
      payload,
      effectiveDate: dateStr,
      weekStart,
      boutiqueId,
      perform: () => applyOverrideChange(payload, user.id, { boutiqueId, sourceBoutiqueId: emp.boutiqueId }),
    });
    if (result.status === 'PENDING_APPROVAL') {
      return NextResponse.json(
        { code: 'PENDING_APPROVAL', requestId: result.requestId },
        { status: 202 }
      );
    }
    const affectedUser = await prisma.user.findUnique({ where: { empId }, select: { id: true } });
    if (affectedUser) {
      emitEventAsync('SCHEDULE_CHANGED', {
        boutiqueId,
        affectedUserIds: [affectedUser.id],
        payload: { date: dateStr, weekStart, changedCount: 1 },
      });
    }
    return NextResponse.json(result.result);
  }

  const created = await applyOverrideChange(payload, user.id, { boutiqueId, sourceBoutiqueId: emp.boutiqueId });
  const affectedUser = await prisma.user.findUnique({ where: { empId }, select: { id: true } });
  if (affectedUser) {
    emitEventAsync('SCHEDULE_CHANGED', {
      boutiqueId,
      affectedUserIds: [affectedUser.id],
      payload: { date: dateStr, weekStart, changedCount: 1 },
    });
  }
  return NextResponse.json(created);
}
