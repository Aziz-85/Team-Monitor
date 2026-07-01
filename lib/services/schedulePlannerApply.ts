/**
 * Apply a schedule assistant plan (batch shift changes + force work).
 */

import { prisma } from '@/lib/db';
import { applyScheduleGridSave, type ChangeItem } from './scheduleApply';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { clearCoverageValidationCache } from './coverageValidation';
import { logAudit } from '@/lib/audit';
import type { PlanAction } from './schedulePlanner';

export class ApplySchedulePlanError extends Error {
  constructor(
    public code: 'LOCKED' | 'PARTIAL' | 'EMPTY',
    message: string
  ) {
    super(message);
    this.name = 'ApplySchedulePlanError';
  }
}

export async function applySchedulePlanActions(input: {
  boutiqueId: string;
  actorUserId: string;
  reason: string;
  actions: PlanAction[];
  /** Original grid cells for overrideId lookup */
  gridRows: Array<{ empId: string; cells: Array<{ date: string; effectiveShift: string; overrideId: string | null }> }>;
}): Promise<{ appliedShifts: number; appliedForceWork: number; appliedGuests: number; skipped: number; errors: string[] }> {
  const { boutiqueId, actorUserId, reason, actions, gridRows } = input;
  if (actions.length === 0) {
    throw new ApplySchedulePlanError('EMPTY', 'No actions to apply');
  }

  const dates = Array.from(new Set(actions.map((a) => a.date)));
  try {
    await assertScheduleEditable({ dates, boutiqueId });
  } catch (e) {
    if (e instanceof ScheduleLockedError) {
      throw new ApplySchedulePlanError('LOCKED', e.message);
    }
    throw e;
  }

  const cellLookup = new Map<string, { effectiveShift: string; overrideId: string | null }>();
  for (const row of gridRows) {
    for (const cell of row.cells) {
      cellLookup.set(`${row.empId}|${cell.date}`, {
        effectiveShift: cell.effectiveShift,
        overrideId: cell.overrideId,
      });
    }
  }

  const shiftChanges: ChangeItem[] = [];
  const forceWorkActions: PlanAction[] = [];
  const errors: string[] = [];

  for (const action of actions) {
    const legacyType = (action as { type?: string }).type;
    if (legacyType === 'GUEST_ADD') {
      errors.push(
        `${action.employeeName} ${action.date}: external coverage must be added manually (Add External Coverage).`
      );
      continue;
    }
    if (action.type === 'FORCE_WORK') {
      forceWorkActions.push(action);
      continue;
    }
    if (
      action.type === 'SHIFT_CHANGE' ||
      action.type === 'REMOVE_COVER' ||
      action.type === 'ASSIGN_SHIFT'
    ) {
      const key = `${action.empId}|${action.date}`;
      const cell = cellLookup.get(key);
      shiftChanges.push({
        empId: action.empId,
        date: action.date,
        newShift: action.toShift,
        originalEffectiveShift: cell?.effectiveShift ?? action.fromShift,
        overrideId: cell?.overrideId ?? null,
      });
    }
  }

  let appliedForceWork = 0;
  for (const fw of forceWorkActions) {
    try {
      await prisma.employeeDayOverride.upsert({
        where: {
          boutiqueId_employeeId_date: { boutiqueId, employeeId: fw.empId, date: fw.date },
        },
        create: {
          boutiqueId,
          employeeId: fw.empId,
          date: fw.date,
          mode: 'FORCE_WORK',
          reason: reason || fw.reason,
        },
        update: { mode: 'FORCE_WORK', reason: reason || fw.reason },
      });
      appliedForceWork++;
    } catch (e) {
      errors.push(`${fw.employeeName} ${fw.date}: ${e instanceof Error ? e.message : 'force work failed'}`);
    }
  }

  let appliedShifts = 0;
  if (shiftChanges.length > 0) {
    const result = await applyScheduleGridSave(
      { reason, changes: shiftChanges },
      actorUserId,
      { boutiqueId, boutiqueIds: [boutiqueId] }
    );
    appliedShifts = result.applied;
    for (const s of result.skippedDetails) {
      errors.push(`${s.empId} ${s.date}: ${s.reason}`);
    }
  }

  clearCoverageValidationCache();

  await logAudit(
    actorUserId,
    'SCHEDULE_PLAN_APPLY',
    'SchedulePlan',
    `${boutiqueId}:${dates[0]}`,
    null,
    JSON.stringify({ appliedShifts, appliedForceWork, appliedGuests: 0, actionCount: actions.length }),
    reason,
    { module: 'SCHEDULE', weekStart: dates[0] }
  );

  return {
    appliedShifts,
    appliedForceWork,
    appliedGuests: 0,
    skipped: errors.length,
    errors,
  };
}
