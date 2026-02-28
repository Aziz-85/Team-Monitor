import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { assertEmployeesExistForSchedule } from '@/lib/tenancy/operationalRoster';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { requiresApproval } from '@/lib/permissions';
import { createOrExecuteApproval } from '@/lib/services/approvals';
import { applyScheduleGridSave, type ChangeItem } from '@/lib/services/scheduleApply';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { prisma } from '@/lib/db';
import { buildScheduleEditAuditPayload } from '@/lib/schedule/scheduleEditAudit';
import { emitEventAsync } from '@/lib/notify/emitEvent';
import type { Role } from '@prisma/client';

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(EDIT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canEditSchedule(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  let body: { reason?: string; changes?: ChangeItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const reason = String(body.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'Reason is required for schedule changes' }, { status: 400 });
  }
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length === 0) {
    return NextResponse.json({ applied: 0, message: 'No changes' });
  }

  const empIds = changes.map((c) => c.empId).filter(Boolean);
  try {
    await assertEmployeesExistForSchedule(empIds);
  } catch (e) {
    const err = e as { message?: string; invalidEmpIds?: string[] };
    return NextResponse.json(
      { error: err.message ?? 'Invalid employee', invalidEmpIds: err.invalidEmpIds },
      { status: 400 }
    );
  }

  const uniqueDates = Array.from(new Set(changes.map((c: ChangeItem) => c.date)));
  try {
    await assertScheduleEditable({
      dates: uniqueDates,
      boutiqueId: scheduleScope.boutiqueId,
    });
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

  const payload = { reason, changes };
  const weekStart = uniqueDates.length > 0 ? getWeekStart(new Date(uniqueDates[0] + 'T00:00:00Z')) : null;
  const applyOptions = { boutiqueIds: scheduleScope.boutiqueIds, boutiqueId: scheduleScope.boutiqueId };

  if (requiresApproval(user.role)) {
    const payloadWithScope = { ...payload, boutiqueIds: scheduleScope.boutiqueIds };
    const result = await createOrExecuteApproval({
      user,
      module: 'SCHEDULE',
      actionType: 'WEEK_SAVE',
      payload: payloadWithScope,
      weekStart: weekStart ?? undefined,
      perform: () => applyScheduleGridSave(payload, user.id, applyOptions),
    });
    if (result.status === 'PENDING_APPROVAL') {
      return NextResponse.json(
        { code: 'PENDING_APPROVAL', requestId: result.requestId },
        { status: 202 }
      );
    }
    if (weekStart) {
      const changesJson = buildScheduleEditAuditPayload(weekStart, changes);
      await prisma.scheduleEditAudit.create({
        data: {
          weekStart: new Date(weekStart + 'T00:00:00Z'),
          editorId: user.id,
          changesJson: changesJson as object,
          source: 'WEB',
          boutiqueId: scheduleScope.boutiqueIds[0] ?? null,
        },
      });
      const affectedEmpIds = Array.from(new Set(changes.map((c) => c.empId).filter(Boolean)));
      if (affectedEmpIds.length > 0 && scheduleScope.boutiqueId) {
        const users = await prisma.user.findMany({
          where: { empId: { in: affectedEmpIds } },
          select: { id: true },
        });
        const affectedUserIds = users.map((u) => u.id);
        const firstDate = uniqueDates[0] ?? weekStart;
        emitEventAsync('SCHEDULE_CHANGED', {
          boutiqueId: scheduleScope.boutiqueId,
          affectedUserIds,
          payload: { date: firstDate, weekStart, changedCount: changes.length },
        });
      }
    }
    return NextResponse.json(result.result);
  }

  const out = await applyScheduleGridSave(payload, user.id, applyOptions);
  if (weekStart) {
    const changesJson = buildScheduleEditAuditPayload(weekStart, changes);
    await prisma.scheduleEditAudit.create({
      data: {
        weekStart: new Date(weekStart + 'T00:00:00Z'),
        editorId: user.id,
        changesJson: changesJson as object,
        source: 'WEB',
        boutiqueId: scheduleScope.boutiqueIds[0] ?? null,
      },
    });
    const affectedEmpIds = Array.from(new Set(changes.map((c) => c.empId).filter(Boolean)));
    if (affectedEmpIds.length > 0 && scheduleScope.boutiqueId) {
      const users = await prisma.user.findMany({
        where: { empId: { in: affectedEmpIds } },
        select: { id: true },
      });
      const affectedUserIds = users.map((u) => u.id);
      const firstDate = uniqueDates[0] ?? weekStart;
      emitEventAsync('SCHEDULE_CHANGED', {
        boutiqueId: scheduleScope.boutiqueId,
        affectedUserIds,
        payload: { date: firstDate, weekStart, changedCount: changes.length },
      });
    }
  }
  return NextResponse.json(out);
}
