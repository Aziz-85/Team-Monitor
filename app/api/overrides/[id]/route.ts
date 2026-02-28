import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { clearCoverageValidationCache } from '@/lib/services/coverageValidation';
import { isAmShiftForbiddenOnDate } from '@/lib/services/shift';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { API_ERROR_MESSAGES } from '@/lib/validationErrors';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { emitEventAsync } from '@/lib/notify/emitEvent';
import type { Role } from '@prisma/client';

const ALLOWED_SHIFTS = ['MORNING', 'EVENING', 'NONE', 'COVER_RASHID_AM', 'COVER_RASHID_PM'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const overrideShift = body.overrideShift != null ? String(body.overrideShift).toUpperCase() : undefined;
  const reason = body.reason !== undefined ? String(body.reason).trim() : undefined;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;

  const existing = await prisma.shiftOverride.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (user.role !== 'ADMIN') {
    const { scope, res } = await requireOperationalScope(request);
    if (res) return res;
    if (existing.boutiqueId !== scope.boutiqueId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const dateStr = existing.date.toISOString().slice(0, 10);
  try {
    await assertScheduleEditable({ dates: [dateStr], boutiqueId: existing.boutiqueId ?? '' });
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

  if (overrideShift !== undefined) {
    if (!ALLOWED_SHIFTS.includes(overrideShift as (typeof ALLOWED_SHIFTS)[number])) {
      return NextResponse.json(
        { error: 'overrideShift must be MORNING, EVENING, NONE, COVER_RASHID_AM, or COVER_RASHID_PM' },
        { status: 400 }
      );
    }
    if (isAmShiftForbiddenOnDate(existing.date, overrideShift as 'MORNING' | 'COVER_RASHID_AM')) {
      return NextResponse.json(
        { error: API_ERROR_MESSAGES.FRIDAY_PM_ONLY, code: 'FRIDAY_PM_ONLY' },
        { status: 400 }
      );
    }
  }

  const hasChange = overrideShift !== undefined || isActive !== undefined;
  if (hasChange && (!reason || reason === '')) {
    return NextResponse.json({ error: 'Reason is required for schedule changes' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (overrideShift !== undefined) update.overrideShift = overrideShift;
  if (reason !== undefined) update.reason = reason;
  if (isActive !== undefined) update.isActive = isActive;

  const updated = await prisma.shiftOverride.update({
    where: { id },
    data: update,
  });
  clearCoverageValidationCache();
  await logAudit(
    user.id,
    'OVERRIDE_UPDATED',
    'ShiftOverride',
    id,
    JSON.stringify(existing),
    JSON.stringify(updated),
    reason ?? null,
    { module: 'SCHEDULE', targetEmployeeId: existing.empId, targetDate: dateStr }
  );
  const weekStart = getWeekStart(existing.date);
  const boutiqueId = existing.boutiqueId ?? '';
  if (boutiqueId) {
    const affectedUser = await prisma.user.findUnique({
      where: { empId: existing.empId },
      select: { id: true },
    });
    if (affectedUser) {
      emitEventAsync('SCHEDULE_CHANGED', {
        boutiqueId,
        affectedUserIds: [affectedUser.id],
        payload: { date: dateStr, weekStart, changedCount: 1 },
      });
    }
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.shiftOverride.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (user.role !== 'ADMIN') {
    const { scope, res } = await requireOperationalScope(request);
    if (res) return res;
    if (existing.boutiqueId !== scope.boutiqueId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const dateStr = existing.date.toISOString().slice(0, 10);
  try {
    await assertScheduleEditable({ dates: [dateStr], boutiqueId: existing.boutiqueId ?? '' });
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

  await prisma.shiftOverride.delete({ where: { id } });
  clearCoverageValidationCache();
  await logAudit(
    user.id,
    'OVERRIDE_DELETED',
    'ShiftOverride',
    existing.empId,
    JSON.stringify({ empId: existing.empId, date: dateStr, overrideShift: existing.overrideShift }),
    JSON.stringify({ removed: true }),
    'Override removed',
    { module: 'SCHEDULE', targetEmployeeId: existing.empId, targetDate: dateStr }
  );
  const weekStart = getWeekStart(existing.date);
  const boutiqueId = existing.boutiqueId ?? '';
  if (boutiqueId) {
    const affectedUser = await prisma.user.findUnique({
      where: { empId: existing.empId },
      select: { id: true },
    });
    if (affectedUser) {
      emitEventAsync('SCHEDULE_CHANGED', {
        boutiqueId,
        affectedUserIds: [affectedUser.id],
        payload: { date: dateStr, weekStart, changedCount: 1 },
      });
    }
  }
  return NextResponse.json({ ok: true, id });
}
