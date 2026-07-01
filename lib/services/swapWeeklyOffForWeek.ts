/**
 * Swap an employee's weekly off to another day for one schedule week only.
 * Uses per-date EmployeeDayOverride (FORCE_WORK on old off, FORCE_OFF on new off).
 */

import { prisma } from '@/lib/db';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { getEffectiveWeeklyOffDay } from '@/lib/schedule/dayOverride';
import { getDowRiyadhFromYmd } from '@/lib/time/weekly';
import { clearCoverageValidationCache } from '@/lib/services/coverageValidation';
import { logAudit } from '@/lib/audit';

export class SwapWeeklyOffError extends Error {
  constructor(
    public code:
      | 'NOT_FOUND'
      | 'NO_WEEKLY_OFF'
      | 'SAME_DAY'
      | 'INVALID_WEEK'
      | 'INVALID_DAY'
      | 'LOCKED',
    message: string
  ) {
    super(message);
    this.name = 'SwapWeeklyOffError';
  }
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function weeklyOffDayLabel(day: number | 'NONE'): string {
  if (day === 'NONE') return 'None';
  return DAY_KEYS[day] ?? String(day);
}

export function weekDateStringsFromStart(weekStart: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return [];
  const start = new Date(weekStart + 'T00:00:00Z');
  const day = start.getUTCDay();
  const daysBack = (day - 6 + 7) % 7;
  start.setUTCDate(start.getUTCDate() - daysBack);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function findDateForDow(weekDates: string[], dow: number): string | null {
  return weekDates.find((d) => getDowRiyadhFromYmd(d) === dow) ?? null;
}

export async function swapWeeklyOffForWeek(input: {
  boutiqueId: string;
  employeeId: string;
  weekStart: string;
  newOffDayOfWeek: number;
  reason: string;
  actorUserId: string;
}): Promise<{ oldOffDate: string; newOffDate: string; effectiveWeeklyOffDay: number | 'NONE' }> {
  const { boutiqueId, employeeId, weekStart, newOffDayOfWeek, reason, actorUserId } = input;

  if (!Number.isInteger(newOffDayOfWeek) || newOffDayOfWeek < 0 || newOffDayOfWeek > 6) {
    throw new SwapWeeklyOffError('INVALID_DAY', 'newOffDayOfWeek must be 0-6');
  }

  const weekDates = weekDateStringsFromStart(weekStart);
  if (weekDates.length !== 7) {
    throw new SwapWeeklyOffError('INVALID_WEEK', 'Invalid weekStart');
  }

  const emp = await prisma.employee.findFirst({
    where: { empId: employeeId, boutiqueId, active: true },
    select: { empId: true, name: true, weeklyOffDay: true, weeklyOffOverrideDay: true },
  });
  if (!emp) {
    throw new SwapWeeklyOffError('NOT_FOUND', 'Employee not found in this boutique');
  }

  const effectiveOff = getEffectiveWeeklyOffDay(emp.weeklyOffDay, emp.weeklyOffOverrideDay);
  if (effectiveOff === 'NONE') {
    throw new SwapWeeklyOffError('NO_WEEKLY_OFF', 'Employee has no weekly off day configured');
  }

  if (newOffDayOfWeek === effectiveOff) {
    throw new SwapWeeklyOffError('SAME_DAY', 'New off day is the same as the regular weekly off');
  }

  const oldOffDate = findDateForDow(weekDates, effectiveOff);
  const newOffDate = findDateForDow(weekDates, newOffDayOfWeek);
  if (!oldOffDate || !newOffDate) {
    throw new SwapWeeklyOffError('INVALID_WEEK', 'Could not resolve week dates');
  }

  try {
    await assertScheduleEditable({ dates: [oldOffDate, newOffDate], boutiqueId });
  } catch (e) {
    if (e instanceof ScheduleLockedError) {
      throw new SwapWeeklyOffError('LOCKED', e.message);
    }
    throw e;
  }

  const auditReason = reason.trim() || 'Weekly off swap (this week only)';

  await prisma.$transaction([
    prisma.employeeDayOverride.upsert({
      where: {
        boutiqueId_employeeId_date: { boutiqueId, employeeId, date: oldOffDate },
      },
      create: {
        boutiqueId,
        employeeId,
        date: oldOffDate,
        mode: 'FORCE_WORK',
        reason: auditReason,
      },
      update: { mode: 'FORCE_WORK', reason: auditReason },
    }),
    prisma.employeeDayOverride.upsert({
      where: {
        boutiqueId_employeeId_date: { boutiqueId, employeeId, date: newOffDate },
      },
      create: {
        boutiqueId,
        employeeId,
        date: newOffDate,
        mode: 'FORCE_OFF',
        reason: auditReason,
      },
      update: { mode: 'FORCE_OFF', reason: auditReason },
    }),
    prisma.shiftOverride.updateMany({
      where: {
        empId: employeeId,
        date: new Date(newOffDate + 'T00:00:00.000Z'),
        isActive: true,
      },
      data: { isActive: false },
    }),
  ]);

  clearCoverageValidationCache();

  await logAudit(
    actorUserId,
    'WEEKLY_OFF_SWAP',
    'EmployeeDayOverride',
    `${employeeId}:${weekStart}`,
    null,
    JSON.stringify({ oldOffDate, newOffDate, newOffDayOfWeek, effectiveOff }),
    auditReason,
    { module: 'SCHEDULE', targetEmployeeId: employeeId, weekStart }
  );

  return { oldOffDate, newOffDate, effectiveWeeklyOffDay: effectiveOff };
}
