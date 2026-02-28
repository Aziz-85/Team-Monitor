/**
 * Sprint 2B: Extracted apply functions for schedule mutations.
 * Used by approval flow and by direct mutations. Locks/validations/logAudit preserved.
 */

import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { clearCoverageValidationCache } from '@/lib/services/coverageValidation';
import { isAmShiftForbiddenOnDate } from '@/lib/services/shift';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { getWeekStart } from '@/lib/services/scheduleLock';

const ALLOWED_SHIFTS = ['MORNING', 'EVENING', 'NONE', 'COVER_RASHID_AM', 'COVER_RASHID_PM'] as const;

export type OverridePayload = {
  empId: string;
  date: string;
  overrideShift: string;
  reason: string;
};

export type ApplyOverrideOptions = {
  /** Required for lock check; lock is per boutique. */
  boutiqueId?: string;
  /** Employee's home boutique (for guest coverage display grouping). */
  sourceBoutiqueId?: string;
};

/**
 * Apply a single override create/update. Caller must have validated body.
 * Throws ScheduleLockedError if locked.
 */
export async function applyOverrideChange(
  payload: OverridePayload,
  actorUserId: string,
  options: ApplyOverrideOptions = {}
): Promise<{ id: string; empId: string; date: string; overrideShift: string }> {
  const { empId, date: dateStr, overrideShift: rawShift, reason } = payload;
  const overrideShift = rawShift.toUpperCase() as (typeof ALLOWED_SHIFTS)[number];
  if (!ALLOWED_SHIFTS.includes(overrideShift)) {
    throw new Error('Invalid override shift');
  }
  if (options.boutiqueId) {
    await assertScheduleEditable({ dates: [dateStr], boutiqueId: options.boutiqueId });
  }
  const date = new Date(dateStr + 'T00:00:00Z');
  if (isAmShiftForbiddenOnDate(date, overrideShift as 'MORNING' | 'COVER_RASHID_AM')) {
    throw new Error('FRIDAY_PM_ONLY');
  }

  const existing = await prisma.shiftOverride.findUnique({
    where: { empId_date: { empId, date } },
  });

  const data = {
    empId,
    date,
    overrideShift,
    reason: reason || null,
    createdByUserId: actorUserId,
    isActive: true,
    ...(options.boutiqueId && { boutiqueId: options.boutiqueId }),
    ...(options.sourceBoutiqueId && { sourceBoutiqueId: options.sourceBoutiqueId }),
  };

  const created = await prisma.shiftOverride.upsert({
    where: { empId_date: { empId, date } },
    update: { ...data, isActive: true },
    create: data,
  });
  clearCoverageValidationCache();

  await logAudit(
    actorUserId,
    existing ? 'OVERRIDE_UPDATED' : 'OVERRIDE_CREATED',
    'ShiftOverride',
    created.id,
    existing ? JSON.stringify(existing) : null,
    JSON.stringify(created),
    reason || null,
    { module: 'SCHEDULE', targetEmployeeId: empId, targetDate: dateStr }
  );

  return {
    id: created.id,
    empId: created.empId,
    date: dateStr,
    overrideShift: created.overrideShift,
  };
}

export type ChangeItem = {
  empId: string;
  date: string;
  newShift: string;
  originalEffectiveShift: string;
  overrideId: string | null;
};

export type GridSavePayload = {
  reason: string;
  changes: ChangeItem[];
};

export type ApplyScheduleGridSaveOptions = {
  boutiqueIds?: string[];
  /** Required for lock check; lock is per boutique. */
  boutiqueId?: string;
};

/**
 * Apply schedule week grid save (batch overrides). Caller must have validated body and lock.
 * Throws ScheduleLockedError if any date is locked.
 * When options.boutiqueIds is set, new overrides get boutiqueId from the employee's assignment.
 */
export async function applyScheduleGridSave(
  payload: GridSavePayload,
  actorUserId: string,
  options: ApplyScheduleGridSaveOptions = {}
): Promise<{ applied: number; total: number; skipped: number; skippedDetails: Array<{ empId: string; date: string; reason: string }> }> {
  const { reason, changes } = payload;
  if (changes.length === 0) {
    return { applied: 0, total: 0, skipped: 0, skippedDetails: [] };
  }

  const uniqueDates = Array.from(new Set(changes.map((c) => c.date)));
  const boutiqueId = options.boutiqueId ?? options.boutiqueIds?.[0];
  if (boutiqueId) {
    await assertScheduleEditable({ dates: uniqueDates, boutiqueId });
  }

  const empIdsInChanges = Array.from(new Set(changes.map((c) => c.empId).filter(Boolean)));
  const sessionBoutiqueId = options.boutiqueId ?? options.boutiqueIds?.[0];
  let empBoutiqueMap = new Map<string, string>();
  if (options.boutiqueIds?.length && empIdsInChanges.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { empId: { in: empIdsInChanges }, boutiqueId: { in: options.boutiqueIds } },
      select: { empId: true, boutiqueId: true },
    });
    empBoutiqueMap = new Map(employees.map((e) => [e.empId, e.boutiqueId]));
  }

  let applied = 0;
  const skipped: Array<{ empId: string; date: string; reason: string }> = [];

  for (const edit of changes) {
    const { empId, date, newShift, originalEffectiveShift, overrideId } = edit;
    if (!empId || !date) continue;
    const shift = String(newShift).toUpperCase();
    if (!ALLOWED_SHIFTS.includes(shift as (typeof ALLOWED_SHIFTS)[number])) continue;
    const dateObj = new Date(date + 'T00:00:00Z');
    if (isAmShiftForbiddenOnDate(dateObj, shift as 'MORNING' | 'COVER_RASHID_AM')) {
      skipped.push({ empId, date, reason: 'FRIDAY_AM_NOT_ALLOWED' });
      continue;
    }

    // Guest (other-branch) employees: use session boutique so override is "at this branch"
    const overrideBoutiqueId = empBoutiqueMap.get(empId) ?? sessionBoutiqueId ?? null;

    try {
      if (shift === originalEffectiveShift && overrideId) {
        await prisma.shiftOverride.update({
          where: { id: overrideId },
          data: { isActive: false },
        });
        applied++;
      } else if (overrideId) {
        await prisma.shiftOverride.update({
          where: { id: overrideId },
          data: {
            overrideShift: shift as (typeof ALLOWED_SHIFTS)[number],
            reason,
          },
        });
        applied++;
      } else {
        await prisma.shiftOverride.upsert({
          where: { empId_date: { empId, date: dateObj } },
          create: {
            empId,
            date: dateObj,
            overrideShift: shift as (typeof ALLOWED_SHIFTS)[number],
            reason,
            createdByUserId: actorUserId,
            isActive: true,
            ...(overrideBoutiqueId && { boutiqueId: overrideBoutiqueId }),
          },
          update: {
            overrideShift: shift as (typeof ALLOWED_SHIFTS)[number],
            reason,
            isActive: true,
          },
        });
        applied++;
      }
    } catch {
      // skip failed row
    }
  }

  clearCoverageValidationCache();
  const weekStart = uniqueDates.length > 0 ? getWeekStart(new Date(uniqueDates[0] + 'T00:00:00Z')) : null;
  await logAudit(
    actorUserId,
    'WEEK_SAVE',
    'ScheduleGrid',
    weekStart ?? '',
    null,
    JSON.stringify({ reason, changesCount: changes.length, applied, dates: uniqueDates }),
    reason,
    { module: 'SCHEDULE', weekStart: weekStart ?? undefined }
  );

  return { applied, total: changes.length, skipped: skipped.length, skippedDetails: skipped };
}

export { ScheduleLockedError };
