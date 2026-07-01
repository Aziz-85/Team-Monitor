import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import {
  applySchedulePlanActions,
  ApplySchedulePlanError,
} from '@/lib/services/schedulePlannerApply';
import type { PlanAction } from '@/lib/services/schedulePlanner';
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

  let body: { weekStart?: string; reason?: string; actions?: PlanAction[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const actions = Array.isArray(body.actions) ? body.actions : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required' }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  }
  if (actions.length === 0) {
    return NextResponse.json({ error: 'No actions to apply' }, { status: 400 });
  }

  const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds: scheduleScope.boutiqueIds });

  try {
    const result = await applySchedulePlanActions({
      boutiqueId: scheduleScope.boutiqueId,
      actorUserId: user.id,
      reason,
      actions,
      gridRows: grid.rows.map((r) => ({
        empId: r.empId,
        cells: r.cells.map((c) => ({
          date: c.date,
          effectiveShift: c.effectiveShift,
          overrideId: c.overrideId,
        })),
      })),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ApplySchedulePlanError) {
      const status = e.code === 'LOCKED' ? 423 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    throw e;
  }
}
