import { prisma } from '@/lib/db';
import { isRamadan } from '@/lib/time/ramadan';
import { availabilityFor } from './availability';
import { getEmployeeTeam } from './employeeTeam';

export type ShiftType =
  | 'MORNING'
  | 'EVENING'
  | 'NONE'
  | 'COVER_RASHID_AM'
  | 'COVER_RASHID_PM';

/** Friday = 5 (UTC). On Friday, AM is forbidden: only PM allowed (PM-only Friday). */
export const FRIDAY_DAY_OF_WEEK = 5;

export function isFriday(date: Date): boolean {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.getUTCDay() === FRIDAY_DAY_OF_WEEK;
}

/** True if this shift is forbidden on the given date (e.g. MORNING/COVER_RASHID_AM on Friday). During Ramadan, Friday allows AM. */
export function isAmShiftForbiddenOnDate(date: Date, shift: ShiftType): boolean {
  if (!isFriday(date)) return false;
  if (shift !== 'MORNING' && shift !== 'COVER_RASHID_AM') return false;
  if (isRamadan(date)) return false;
  return true;
}

/** True if PM shift is forbidden on the given date. Used only when Friday is PM-only (currently false; Friday allows PM). */
export function isPmShiftForbiddenOnDate(): boolean {
  return false;
}

export async function effectiveShiftFor(empId: string, date: Date): Promise<ShiftType> {
  const availability = await availabilityFor(empId, date);
  if (availability !== 'WORK') return 'NONE';

  const override = await prisma.shiftOverride.findFirst({
    where: {
      empId,
      date: toDateOnly(date),
      isActive: true,
    },
  });
  if (override) {
    return override.overrideShift as ShiftType;
  }

  return computeShiftByLaw(empId, date);
}

/** Base shift from rotation law only (no override). Used for grid "Reset" and display. Friday is PM-only. */
export async function getBaseShiftFor(empId: string, date: Date): Promise<ShiftType> {
  const availability = await availabilityFor(empId, date);
  if (availability !== 'WORK') return 'NONE';
  return computeShiftByLaw(empId, date);
}

/** Team parity by week; Friday is always EVENING (PM-only). Uses team effective on date. */
async function computeShiftByLaw(empId: string, date: Date): Promise<ShiftType> {
  let team: 'A' | 'B';
  try {
    team = await getEmployeeTeam(empId, date);
  } catch {
    return 'NONE';
  }

  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay();
  if (dayOfWeek === FRIDAY_DAY_OF_WEEK) {
    return 'EVENING';
  }

  const weekIndex = getWeekIndexInYear(date);
  const isEvenWeek = weekIndex % 2 === 0;

  if (team === 'A') {
    return isEvenWeek ? 'MORNING' : 'EVENING';
  }
  return isEvenWeek ? 'EVENING' : 'MORNING';
}

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Week index from first Saturday of year (Asia/Riyadh week start).
 * weekIndex = floor((date - firstSaturdayOfYear) / 7).
 * EVEN weekIndex → TEAM_A MORNING, TEAM_B EVENING; ODD → TEAM_A EVENING, TEAM_B MORNING.
 */
export function getWeekIndexInYear(date: Date): number {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const startOfYearDay = startOfYear.getUTCDay();
  const firstSaturday = startOfYearDay <= 6 ? (6 - startOfYearDay) % 7 : 0;
  const firstSat = new Date(startOfYear);
  firstSat.setUTCDate(1 + firstSaturday);
  const diff = d.getTime() - firstSat.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

export function getWeekNumberInYear(date: Date): number {
  const weekIndex = getWeekIndexInYear(date);
  const year = new Date(date).getUTCFullYear();
  return weekIndex + 1 + year * 53;
}

