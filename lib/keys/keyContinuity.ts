/**
 * Key handover continuity validation.
 * Ensures: every day has AM and PM holder, AM != PM, holders are scheduled that day;
 * and if PM holder of day D is not scheduled AM on D+1, a handover must exist to D+1 AM holder.
 */

import { rosterForDate } from '@/lib/services/roster';
import {
  getDayKeyHolders,
  pmBoundaryUtc,
  amBoundaryUtc,
  type DayKeyAssignment,
} from '@/lib/keys/keyService';
import { prisma } from '@/lib/db';

export type ContinuityError = {
  date?: string;
  code: 'MISSING_AM_HOLDER' | 'MISSING_PM_HOLDER' | 'AM_EQ_PM' | 'AM_NOT_SCHEDULED' | 'PM_NOT_SCHEDULED' | 'MISSING_HANDOVER_TO_NEXT_AM';
  message: string;
};

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Validate key continuity for a week.
 * - Each day must have AM holder and PM holder, AM !== PM.
 * - AM holder must be in roster AM that day; PM holder must be in roster PM that day.
 * - If PM holder of day D is not scheduled AM on D+1, there must be a handover between D 16:00 and D+1 09:00 to D+1 AM holder.
 */
export async function validateWeekKeyContinuity(
  boutiqueId: string,
  weekStart: string,
  assignments: DayKeyAssignment[]
): Promise<ContinuityError[]> {
  const errors: ContinuityError[] = [];
  const boutiqueIds = [boutiqueId];

  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(weekStart, i);
    const day = assignments.find((a) => a.date === dateStr);
    const amHolder = day?.amHolderEmpId ?? null;
    const pmHolder = day?.pmHolderEmpId ?? null;

    if (!amHolder) {
      errors.push({ date: dateStr, code: 'MISSING_AM_HOLDER', message: `Day ${dateStr}: AM key holder is required.` });
    }
    if (!pmHolder) {
      errors.push({ date: dateStr, code: 'MISSING_PM_HOLDER', message: `Day ${dateStr}: PM key holder is required.` });
    }
    if (amHolder && pmHolder && amHolder === pmHolder) {
      errors.push({ date: dateStr, code: 'AM_EQ_PM', message: `Day ${dateStr}: AM and PM key holders must be different.` });
    }

    const roster = await rosterForDate(new Date(dateStr + 'T12:00:00Z'), { boutiqueIds });
    const amEmpIds = new Set(roster.amEmployees.map((e) => e.empId));
    const pmEmpIds = new Set(roster.pmEmployees.map((e) => e.empId));
    const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
    const isFriday = dayOfWeek === 5;
    if (amHolder && !amEmpIds.has(amHolder) && !(isFriday && pmEmpIds.has(amHolder))) {
      errors.push({ date: dateStr, code: 'AM_NOT_SCHEDULED', message: `Day ${dateStr}: AM key holder must be scheduled that day.` });
    }
    if (pmHolder && !pmEmpIds.has(pmHolder)) {
      errors.push({ date: dateStr, code: 'PM_NOT_SCHEDULED', message: `Day ${dateStr}: PM key holder must be scheduled PM that day.` });
    }
  }

  for (let i = 0; i < 6; i++) {
    const dateStr = addDays(weekStart, i);
    const nextStr = addDays(weekStart, i + 1);
    const day = assignments.find((a) => a.date === dateStr);
    const nextDay = assignments.find((a) => a.date === nextStr);
    const pmHolderD = day?.pmHolderEmpId ?? null;
    const amHolderNext = nextDay?.amHolderEmpId ?? null;
    if (!pmHolderD || !amHolderNext) continue;
    if (pmHolderD === amHolderNext) continue;

    const rosterNext = await rosterForDate(new Date(nextStr + 'T12:00:00Z'), { boutiqueIds });
    const amEmpIdsNext = new Set(rosterNext.amEmployees.map((e) => e.empId));
    if (amEmpIdsNext.has(pmHolderD)) continue;

    const pmBound = pmBoundaryUtc(dateStr);
    const amBoundNext = amBoundaryUtc(nextStr);
    const handovers = await prisma.keyHandover.findMany({
      where: {
        boutiqueId,
        handoverAt: { gt: pmBound, lte: amBoundNext },
        toEmployeeId: amHolderNext,
      },
      select: { id: true },
    });
    if (handovers.length === 0) {
      errors.push({
        date: dateStr,
        code: 'MISSING_HANDOVER_TO_NEXT_AM',
        message: `Missing handover to next day AM holder (${amHolderNext}) between ${dateStr} PM and ${nextStr} AM.`,
      });
    }
  }

  return errors;
}

/**
 * Same validation but using stored handovers for the week (for lock/save when we have no in-memory assignments).
 */
export async function validateWeekKeyContinuityFromHandovers(
  boutiqueId: string,
  weekStart: string
): Promise<ContinuityError[]> {
  const assignments: DayKeyAssignment[] = [];
  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(weekStart, i);
    const { amHolderEmpId, pmHolderEmpId } = await getDayKeyHolders(boutiqueId, dateStr);
    assignments.push({ date: dateStr, amHolderEmpId, pmHolderEmpId });
  }
  return validateWeekKeyContinuity(boutiqueId, weekStart, assignments);
}
