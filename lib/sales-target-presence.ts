/**
 * Sales target presence: scheduled days and APPROVED leave days in a month.
 * Respects: Riyadh DoW, closed official holidays (excluded), event periods (weekly off suspended).
 */

import { prisma } from '@/lib/db';
import { getMonthRange } from '@/lib/time';
import { toYmdRiyadh } from '@/lib/time/weekly';
import { getDowRiyadhFromYmd, getEffectiveWeeklyOffDay } from '@/lib/schedule/dayOverride';
import type { LeaveStatus } from '@prisma/client';

const APPROVED_LEAVE_STATUS: LeaveStatus = 'APPROVED';

export type PresenceForEmp = {
  scheduledDaysInMonth: number;
  leaveDaysInMonth: number;
  presentDaysInMonth: number;
  presenceFactor: number;
};

/**
 * Returns presence metrics per empId for the given month.
 * - scheduledDaysInMonth: days in month where employee is scheduled to work (base schedule + overrides; excludes weekly off and NONE override).
 * - leaveDaysInMonth: calendar days in month that fall within an APPROVED leave.
 * - presentDaysInMonth: max(0, scheduled - leave).
 * - presenceFactor: presentDaysInMonth / scheduledDaysInMonth, or 0 if scheduled is 0.
 */
export async function getPresenceForMonth(
  empIds: string[],
  monthKey: string
): Promise<Map<string, PresenceForEmp>> {
  const result = new Map<string, PresenceForEmp>();
  for (const empId of empIds) {
    result.set(empId, {
      scheduledDaysInMonth: 0,
      leaveDaysInMonth: 0,
      presentDaysInMonth: 0,
      presenceFactor: 0,
    });
  }
  if (empIds.length === 0) return result;

  const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);
  const dateStrs: string[] = [];
  const d = new Date(monthStart);
  const endMs = monthEnd.getTime();
  while (d.getTime() < endMs) {
    dateStrs.push(toYmdRiyadh(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const employees = await prisma.employee.findMany({
    where: { empId: { in: empIds } },
    select: { empId: true, weeklyOffDay: true, weeklyOffOverrideDay: true, boutiqueId: true },
  });
  const boutiqueIds = Array.from(new Set(employees.map((e) => e.boutiqueId)));

  const [overrides, leaves, closedHolidays, eventPeriods] = await Promise.all([
    prisma.shiftOverride.findMany({
      where: {
        empId: { in: empIds },
        date: { gte: monthStart, lt: monthEnd },
        isActive: true,
      },
      select: { empId: true, date: true, overrideShift: true },
    }),
    prisma.leave.findMany({
      where: {
        empId: { in: empIds },
        status: APPROVED_LEAVE_STATUS,
        startDate: { lte: new Date(monthEnd.getTime() - 1) },
        endDate: { gte: monthStart },
      },
      select: { empId: true, startDate: true, endDate: true },
    }),
    boutiqueIds.length > 0
      ? prisma.officialHoliday.findMany({
          where: { date: { in: dateStrs }, isClosed: true, boutiqueId: { in: boutiqueIds } },
          select: { boutiqueId: true, date: true },
        })
      : Promise.resolve([]),
    boutiqueIds.length > 0
      ? prisma.eventPeriod.findMany({
          where: {
            boutiqueId: { in: boutiqueIds },
            startDate: { lte: dateStrs[dateStrs.length - 1] ?? '' },
            endDate: { gte: dateStrs[0] ?? '' },
            OR: [{ suspendWeeklyOff: true }, { forceWork: true }],
          },
          select: { boutiqueId: true, startDate: true, endDate: true },
        })
      : Promise.resolve([]),
  ]);

  const empByEmpId = new Map(employees.map((e) => [e.empId, e]));
  const overrideByKey = new Map<string, string>();
  for (const o of overrides) {
    const key = `${o.empId}_${o.date.toISOString().slice(0, 10)}`;
    overrideByKey.set(key, o.overrideShift);
  }
  const leaveRangesByEmp = new Map<string, Array<{ start: Date; end: Date }>>();
  for (const l of leaves) {
    const list = leaveRangesByEmp.get(l.empId) ?? [];
    list.push({ start: l.startDate, end: l.endDate });
    leaveRangesByEmp.set(l.empId, list);
  }
  const holidayClosedSet = new Set(closedHolidays.map((h) => `${h.boutiqueId}_${h.date}`));
  const suspensionSet = new Set<string>();
  for (const p of eventPeriods) {
    for (const ymd of dateStrs) {
      if (ymd >= p.startDate && ymd <= p.endDate) suspensionSet.add(`${p.boutiqueId}_${ymd}`);
    }
  }

  for (const empId of empIds) {
    const emp = empByEmpId.get(empId);
    const effectiveOff = emp
      ? getEffectiveWeeklyOffDay(emp.weeklyOffDay, emp.weeklyOffOverrideDay)
      : 0;
    const boutiqueId = emp?.boutiqueId ?? '';
    let scheduled = 0;
    let leaveDays = 0;

    for (const dateStr of dateStrs) {
      if (boutiqueId && holidayClosedSet.has(`${boutiqueId}_${dateStr}`)) continue;
      const dayOfWeekRiyadh = getDowRiyadhFromYmd(dateStr);
      const inSuspension = boutiqueId ? suspensionSet.has(`${boutiqueId}_${dateStr}`) : false;
      const isOff = effectiveOff !== 'NONE' && !inSuspension && dayOfWeekRiyadh === effectiveOff;
      const overrideShift = overrideByKey.get(`${empId}_${dateStr}`);
      if (overrideShift === 'NONE') continue;
      if (isOff && !overrideShift) continue;
      scheduled++;

      const leaveRanges = leaveRangesByEmp.get(empId) ?? [];
      const date = new Date(dateStr + 'T00:00:00Z');
      const onLeave = leaveRanges.some((r) => {
        const dayMs = date.getTime();
        const startMs = new Date(r.start).setUTCHours(0, 0, 0, 0);
        const endMs = new Date(r.end).setUTCHours(23, 59, 59, 999);
        return dayMs >= startMs && dayMs <= endMs;
      });
      if (onLeave) leaveDays++;
    }

    const present = Math.max(0, scheduled - leaveDays);
    const presenceFactor = scheduled > 0 ? present / scheduled : 0;
    result.set(empId, {
      scheduledDaysInMonth: scheduled,
      leaveDaysInMonth: leaveDays,
      presentDaysInMonth: present,
      presenceFactor,
    });
  }

  return result;
}
