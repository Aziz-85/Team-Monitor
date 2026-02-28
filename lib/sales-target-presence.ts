/**
 * Sales target presence: scheduled days and APPROVED leave days in a month.
 * Used for leave-adjusted target distribution. Reads schedule (overrides, team) and Leave only.
 */

import { prisma } from '@/lib/db';
import { getMonthRange } from '@/lib/time';
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
    dateStrs.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const [employees, overrides, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: { empId: { in: empIds } },
      select: { empId: true, weeklyOffDay: true },
    }),
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

  for (const empId of empIds) {
    const emp = empByEmpId.get(empId);
    const weeklyOffDay = emp?.weeklyOffDay ?? 0;
    let scheduled = 0;
    let leaveDays = 0;

    for (const dateStr of dateStrs) {
      const date = new Date(dateStr + 'T00:00:00Z');
      const dayOfWeek = date.getUTCDay();
      const isOff = dayOfWeek === weeklyOffDay;
      const overrideShift = overrideByKey.get(`${empId}_${dateStr}`);
      if (overrideShift === 'NONE') continue;
      if (isOff && !overrideShift) continue; // weekly off, no override
      scheduled++;

      const leaveRanges = leaveRangesByEmp.get(empId) ?? [];
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
