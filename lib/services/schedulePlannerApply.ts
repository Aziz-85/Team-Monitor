/**
 * Apply a schedule assistant plan (batch shift changes + force work).
 *
 * Engine v3 gate: before persisting, the resulting week is validated against the
 * engine's 30-minute slot coverage (validateTimeCoverageForGrid). Apply is rejected
 * with COVERAGE_INVALID + slotViolations unless the caller explicitly forces it.
 * The audit entry records the engine validation output — it is never recomputed.
 */

import { prisma } from '@/lib/db';
import { applyScheduleGridSave, type ChangeItem } from './scheduleApply';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { clearCoverageValidationCache } from './coverageValidation';
import { logAudit } from '@/lib/audit';
import type { PlanAction } from './schedulePlanner';
import type { ScheduleGridResult } from './scheduleGrid';
import { validateTimeCoverageForGrid, type TimeCoverageResult } from '@/lib/schedule/timeCoverageValidation';
import type { SlotViolation, WorkingDayShift } from '@/lib/schedule/generateSchedule/types';

export class ApplySchedulePlanError extends Error {
  constructor(
    public code: 'LOCKED' | 'PARTIAL' | 'EMPTY' | 'COVERAGE_INVALID',
    message: string,
    public slotViolations: SlotViolation[] = []
  ) {
    super(message);
    this.name = 'ApplySchedulePlanError';
  }
}

/** Simulate plan actions on the grid and run the engine slot validation. */
export function validatePlanCoverage(
  grid: ScheduleGridResult,
  actions: PlanAction[]
): TimeCoverageResult {
  const actionByKey = new Map(actions.map((a) => [`${a.empId}|${a.date}`, a]));
  const simulatedRows = grid.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => {
      const action = actionByKey.get(`${row.empId}|${cell.date}`);
      if (!action || cell.availability !== 'WORK') return cell;
      return {
        ...cell,
        effectiveShift: action.toShift as typeof cell.effectiveShift,
        segments: action.segments ?? undefined,
      };
    }),
  }));

  const extrasByDate = new Map<string, WorkingDayShift[]>();
  for (const g of grid.externalCoverageShifts ?? []) {
    const list = extrasByDate.get(g.date) ?? [];
    list.push(g);
    extrasByDate.set(g.date, list);
  }

  return validateTimeCoverageForGrid(simulatedRows, grid.dayCountContexts, extrasByDate);
}

export async function applySchedulePlanActions(input: {
  boutiqueId: string;
  actorUserId: string;
  reason: string;
  actions: PlanAction[];
  /** Full engine grid output for the week (simulation + overrideId lookup). */
  grid: ScheduleGridResult;
  /** Apply even when slot coverage is invalid (explicit user confirmation required). */
  force?: boolean;
}): Promise<{ appliedShifts: number; appliedForceWork: number; appliedGuests: number; skipped: number; errors: string[]; coverage: TimeCoverageResult }> {
  const { boutiqueId, actorUserId, reason, actions, grid, force = false } = input;
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

  // Engine v3 validation gate: CoverageValid must be true before Apply.
  const coverage = validatePlanCoverage(grid, actions);
  if (!coverage.valid && !force) {
    throw new ApplySchedulePlanError(
      'COVERAGE_INVALID',
      `Plan leaves ${coverage.violations.length} time slot(s) below minimum coverage`,
      coverage.violations
    );
  }

  const cellLookup = new Map<string, { effectiveShift: string; overrideId: string | null }>();
  for (const row of grid.rows) {
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
        segments: action.segments,
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

  // Audit reads the engine validation output computed above — no second calculation.
  await logAudit(
    actorUserId,
    'SCHEDULE_PLAN_APPLY',
    'SchedulePlan',
    `${boutiqueId}:${dates[0]}`,
    null,
    JSON.stringify({
      appliedShifts,
      appliedForceWork,
      appliedGuests: 0,
      actionCount: actions.length,
      coverageValid: coverage.valid,
      slotViolationCount: coverage.violations.length,
      slotViolations: coverage.violations.slice(0, 20),
      forced: force && !coverage.valid,
    }),
    reason,
    { module: 'SCHEDULE', weekStart: dates[0] }
  );

  return {
    appliedShifts,
    appliedForceWork,
    appliedGuests: 0,
    skipped: errors.length,
    errors,
    coverage,
  };
}
