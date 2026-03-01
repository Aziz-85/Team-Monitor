/**
 * Day-override, holiday, suspension and comp-day helpers.
 * All dates "YYYY-MM-DD" are Riyadh calendar days. Day-of-week uses Riyadh.
 */

import { prisma } from '@/lib/db';
import type { DayOverrideMode } from '@prisma/client';
import { getDowRiyadhFromYmd, toYmdRiyadh } from '@/lib/time/weekly';
import { shouldSuspendWeeklyOff } from '@/lib/services/calendarPolicy';

export { getDowRiyadhFromYmd, toYmdRiyadh };

/** Effective weekly off day: null/undefined → use base; -1 → no weekly off (NONE); 0..6 → that day is OFF. */
export function getEffectiveWeeklyOffDay(
  weeklyOffDay: number,
  weeklyOffOverrideDay: number | null | undefined
): number | 'NONE' {
  if (weeklyOffOverrideDay == null) return weeklyOffDay;
  if (weeklyOffOverrideDay === -1) return 'NONE';
  return weeklyOffOverrideDay;
}

/** Whether the date falls inside any event period that suspends weekly off (or forceWork). */
export async function isDateInSuspensionPeriod(
  boutiqueId: string,
  ymd: string
): Promise<boolean> {
  return shouldSuspendWeeklyOff(boutiqueId, ymd);
}

/** Get employee day override for the date, if any. */
export async function getEmployeeOverride(
  boutiqueId: string,
  employeeId: string,
  ymd: string
): Promise<{ mode: DayOverrideMode; reason: string | null } | null> {
  const row = await prisma.employeeDayOverride.findUnique({
    where: {
      boutiqueId_employeeId_date: { boutiqueId, employeeId, date: ymd },
    },
    select: { mode: true, reason: true },
  });
  return row;
}

/** Whether the date is an official holiday for the boutique (any, closed or open). */
export async function isOfficialHoliday(boutiqueId: string, ymd: string): Promise<boolean> {
  const row = await prisma.officialHoliday.findUnique({
    where: { boutiqueId_date: { boutiqueId, date: ymd } },
    select: { id: true },
  });
  return !!row;
}

/** Comp day balance: sum(CREDIT.units) - sum(DEBIT.units). Scoped by employee (all boutiques). */
export async function compDayBalance(employeeId: string): Promise<number> {
  const rows = await prisma.compDayLedger.findMany({
    where: { employeeId },
    select: { type: true, units: true },
  });
  let balance = 0;
  for (const r of rows) {
    if (r.type === 'CREDIT') balance += r.units;
    else balance -= r.units;
  }
  return balance;
}

/** Comp day balance for one employee in one boutique (if you need boutique-scoped). */
export async function compDayBalanceForBoutique(
  boutiqueId: string,
  employeeId: string
): Promise<number> {
  const rows = await prisma.compDayLedger.findMany({
    where: { boutiqueId, employeeId },
    select: { type: true, units: true },
  });
  let balance = 0;
  for (const r of rows) {
    if (r.type === 'CREDIT') balance += r.units;
    else balance -= r.units;
  }
  return balance;
}

/**
 * When admin assigns a shift (MORNING/EVENING) on a day that would normally be weekly off:
 * - Ensure EmployeeDayOverride FORCE_WORK exists (so availability is WORK).
 * - Create one CompDayLedger CREDIT if not already present.
 * Call after applying a shift override. Uses Riyadh date.
 */
export async function ensureForceWorkAndCompCredit(
  boutiqueId: string,
  employeeId: string,
  dateYmdRiyadh: string,
  weeklyOffDay: number,
  note?: string
): Promise<void> {
  const dow = getDowRiyadhFromYmd(dateYmdRiyadh);
  if (dow !== weeklyOffDay) return;
  const inSuspension = await isDateInSuspensionPeriod(boutiqueId, dateYmdRiyadh);
  if (inSuspension) return;

  await prisma.employeeDayOverride.upsert({
    where: {
      boutiqueId_employeeId_date: { boutiqueId, employeeId, date: dateYmdRiyadh },
    },
    create: {
      boutiqueId,
      employeeId,
      date: dateYmdRiyadh,
      mode: 'FORCE_WORK',
      reason: note ?? 'Work on weekly off',
    },
    update: { mode: 'FORCE_WORK', reason: note ?? 'Work on weekly off' },
  });

  const existing = await prisma.compDayLedger.findFirst({
    where: {
      boutiqueId,
      employeeId,
      date: dateYmdRiyadh,
      type: 'CREDIT',
    },
    select: { id: true },
  });
  if (!existing) {
    await prisma.compDayLedger.create({
      data: {
        boutiqueId,
        employeeId,
        date: dateYmdRiyadh,
        type: 'CREDIT',
        units: 1,
        note: note ?? 'Worked on weekly off day',
      },
    });
  }
}
