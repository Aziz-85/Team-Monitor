/**
 * Phase F Sprint 1: Central guard for schedule edits.
 * Every write API (overrides, coverage, grid save) MUST call this before mutating.
 * Throws with code DAY_LOCKED or WEEK_LOCKED; API returns 403.
 */

import { getWeekStart, getWeekLockInfo, getDayLockInfo, type LockInfo } from '@/lib/services/scheduleLock';

export class ScheduleLockedError extends Error {
  constructor(
    public readonly code: 'DAY_LOCKED' | 'WEEK_LOCKED',
    message: string,
    public readonly lockInfo?: LockInfo
  ) {
    super(message);
    this.name = 'ScheduleLockedError';
  }
}

export type AssertScheduleEditableParams = {
  /** Check these dates (YYYY-MM-DD). Week lock checked for each date's week; day lock for each date. */
  dates?: string[];
  /** Or check this week (Saturday YYYY-MM-DD). Only week lock is checked. */
  weekStart?: string;
  /** Boutique for which lock is checked (required; lock is per boutique). */
  boutiqueId: string;
};

/**
 * Asserts that the given date(s) or week are editable (not day- or week-locked) for this boutique.
 * Call before any schedule write. Throws ScheduleLockedError with code DAY_LOCKED or WEEK_LOCKED.
 */
export async function assertScheduleEditable(params: AssertScheduleEditableParams): Promise<void> {
  const { dates, weekStart, boutiqueId } = params;
  if (!boutiqueId?.trim()) return;

  if (weekStart) {
    const lockInfo = await getWeekLockInfo(weekStart, boutiqueId);
    if (lockInfo) {
      throw new ScheduleLockedError('WEEK_LOCKED', 'Schedule week is locked', lockInfo);
    }
    return;
  }

  if (dates && dates.length > 0) {
    const weekStarts = new Set<string>();
    for (const d of dates) {
      weekStarts.add(getWeekStart(new Date(d + 'T00:00:00Z')));
    }
    for (const ws of Array.from(weekStarts)) {
      const lockInfo = await getWeekLockInfo(ws, boutiqueId);
      if (lockInfo) {
        throw new ScheduleLockedError('WEEK_LOCKED', 'Schedule week is locked', lockInfo);
      }
    }
    for (const d of dates) {
      const lockInfo = await getDayLockInfo(new Date(d + 'T00:00:00Z'), boutiqueId);
      if (lockInfo) {
        throw new ScheduleLockedError('DAY_LOCKED', 'Schedule day is locked', lockInfo);
      }
    }
  }
}
