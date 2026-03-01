import { prisma } from '@/lib/db';
import {
  getDowRiyadhFromYmd,
  toYmdRiyadh,
  getEmployeeOverride,
  isDateInSuspensionPeriod,
  getEffectiveWeeklyOffDay,
} from '@/lib/schedule/dayOverride';
import { isBoutiqueClosedHoliday } from '@/lib/services/calendarPolicy';

export type AvailabilityStatus = 'LEAVE' | 'OFF' | 'WORK' | 'ABSENT' | 'HOLIDAY';

/**
 * Precedence when boutiqueId is provided (full policy):
 * 1) Approved Leave => LEAVE (highest; never overridden by weekly off)
 * 2) EmployeeDayOverride FORCE_OFF => OFF; FORCE_WORK => treat as WORKABLE
 * 3) OfficialHoliday.isClosed=true => HOLIDAY
 * 4) EventPeriod (suspendWeeklyOff or forceWork) => ignore weekly off
 * 5) Effective weekly off day => OFF
 * 6) InventoryAbsent => ABSENT
 * 7) WORK
 */
export async function availabilityFor(
  empId: string,
  date: Date,
  boutiqueId?: string
): Promise<AvailabilityStatus> {
  const d = toDateOnly(date);
  const ymd = toYmdRiyadh(d);

  const leave = await prisma.leave.findFirst({
    where: {
      empId,
      status: 'APPROVED',
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  if (leave) return 'LEAVE';

  if (boutiqueId) {
    const override = await getEmployeeOverride(boutiqueId, empId, ymd);
    if (override?.mode === 'FORCE_OFF') return 'OFF';
    if (override?.mode === 'FORCE_WORK') {
      const absent = await prisma.inventoryAbsent.findUnique({
        where: { boutiqueId_date_empId: { boutiqueId, date: d, empId } },
      });
      if (absent) return 'ABSENT';
      return 'WORK';
    }

    const isClosedHoliday = await isBoutiqueClosedHoliday(boutiqueId, ymd);
    if (isClosedHoliday) return 'HOLIDAY';

    const emp = await prisma.employee.findUnique({
      where: { empId },
      select: { weeklyOffDay: true, weeklyOffOverrideDay: true },
    });
    if (emp) {
      const inSuspension = await isDateInSuspensionPeriod(boutiqueId, ymd);
      if (!inSuspension) {
        const effective = getEffectiveWeeklyOffDay(emp.weeklyOffDay, emp.weeklyOffOverrideDay);
        if (effective !== 'NONE' && getDowRiyadhFromYmd(ymd) === effective) return 'OFF';
      }
    }

    const absent = await prisma.inventoryAbsent.findUnique({
      where: { boutiqueId_date_empId: { boutiqueId, date: d, empId } },
    });
    if (absent) return 'ABSENT';
    return 'WORK';
  }

  const emp = await prisma.employee.findUnique({
    where: { empId },
    select: { weeklyOffDay: true, weeklyOffOverrideDay: true },
  });
  if (emp) {
    const effective = getEffectiveWeeklyOffDay(emp.weeklyOffDay, emp.weeklyOffOverrideDay);
    if (effective !== 'NONE' && getDayOfWeek(date) === effective) return 'OFF';
  }

  const absent = await prisma.inventoryAbsent.findFirst({
    where: { date: d, empId },
  });
  if (absent) return 'ABSENT';

  return 'WORK';
}

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** UTC day-of-week (legacy). Prefer getDowRiyadhFromYmd when you have ymd. */
export function getDayOfWeek(date: Date): number {
  return date.getUTCDay();
}
