import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import type { WeeklyOffMove } from '@/lib/schedule-next/types';
import {
  applySchedulePlanActions,
  ApplySchedulePlanError,
} from '@/lib/services/schedulePlannerApply';
import type { PlanAction } from '@/lib/services/schedulePlanner';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { swapWeeklyOffForWeek, SwapWeeklyOffError } from '@/lib/services/swapWeeklyOffForWeek';
import type { Role } from '@prisma/client';

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

type ApplyBody = {
  proposalId?: string;
  weekStart?: string;
  reason?: string;
  actions?: PlanAction[];
  weeklyOffMoves?: WeeklyOffMove[];
  force?: boolean;
};

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

  let body: ApplyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const actions = Array.isArray(body.actions) ? body.actions : [];
  const weeklyOffMoves = Array.isArray(body.weeklyOffMoves) ? body.weeklyOffMoves : [];
  const force = body.force === true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  }
  if (actions.length === 0 && weeklyOffMoves.length === 0) {
    return NextResponse.json({ error: 'No actions to apply' }, { status: 400 });
  }

  const boutiqueId = scheduleScope.boutiqueId;
  const swapErrors: string[] = [];
  let swapped = 0;

  for (const move of weeklyOffMoves) {
    try {
      await swapWeeklyOffForWeek({
        boutiqueId,
        employeeId: move.empId,
        weekStart,
        newOffDayOfWeek: move.toDayOfWeek,
        reason: reason || 'Schedule Next weekly off move',
        actorUserId: user.id,
      });
      swapped++;
    } catch (e) {
      const msg =
        e instanceof SwapWeeklyOffError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Weekly off swap failed';
      swapErrors.push(`${move.name}: ${msg}`);
    }
  }

  try {
    const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds: scheduleScope.boutiqueIds });
    const result =
      actions.length > 0
        ? await applySchedulePlanActions({
            boutiqueId,
            actorUserId: user.id,
            reason,
            actions,
            grid,
            force,
          })
        : {
            appliedShifts: 0,
            appliedForceWork: 0,
            errors: [] as string[],
            coverageValid: true,
          };

    return NextResponse.json({
      ok: true,
      proposalId: body.proposalId ?? null,
      swappedWeeklyOff: swapped,
      swapErrors,
      ...result,
      errors: [...swapErrors, ...(result.errors ?? [])],
    });
  } catch (e) {
    if (e instanceof ApplySchedulePlanError) {
      const status = e.code === 'LOCKED' ? 423 : e.code === 'COVERAGE_INVALID' ? 422 : 400;
      return NextResponse.json(
        { error: e.message, code: e.code, slotViolations: e.slotViolations, swapErrors },
        { status }
      );
    }
    console.error('[schedule/next/apply]', e);
    const message = e instanceof Error ? e.message : 'Failed to apply schedule';
    return NextResponse.json({ error: message, swapErrors }, { status: 500 });
  }
}
