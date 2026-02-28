import { availabilityFor } from './availability';
import { effectiveShiftFor } from './shift';
import type { Task, TaskPlan, TaskSchedule } from '@prisma/client';

export type AssignmentReason = 'Primary' | 'Backup1' | 'Backup2' | 'UNASSIGNED';

export interface TaskAssignmentResult {
  assignedEmpId: string | null;
  assignedName: string | null;
  reason: AssignmentReason;
  reasonNotes: string[];
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getLastDayOfMonth(date: Date): number {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (month === 1) return isLeapYear(year) ? 29 : 28;
  return DAYS_IN_MONTH[month] ?? 31;
}

export function tasksRunnableOnDate(
  task: Task & { taskSchedules: TaskSchedule[] },
  date: Date
): boolean {
  const d = date;
  const dayOfWeek = d.getUTCDay();
  const dayOfMonth = d.getUTCDate();
  const lastDay = getLastDayOfMonth(d);

  for (const sched of task.taskSchedules) {
    if (!sched.type) continue;
    if (sched.type === 'DAILY') return true;
    if (sched.type === 'WEEKLY' && sched.weeklyDays?.includes(dayOfWeek)) return true;
    if (sched.type === 'MONTHLY') {
      if (sched.isLastDay && dayOfMonth === lastDay) return true;
      if (sched.monthlyDay != null && sched.monthlyDay === dayOfMonth) return true;
    }
  }
  return false;
}

export async function assignTaskOnDate(
  task: Task & { taskPlans: (TaskPlan & { primary: { empId: string; name: string }; backup1: { empId: string; name: string }; backup2: { empId: string; name: string } })[] },
  date: Date
): Promise<TaskAssignmentResult> {
  const plan = task.taskPlans[0];
  if (!plan) {
    return { assignedEmpId: null, assignedName: null, reason: 'UNASSIGNED', reasonNotes: ['No task plan'] };
  }

  const candidates = [
    { empId: plan.primaryEmpId, name: plan.primary.name, role: 'Primary' as const },
    { empId: plan.backup1EmpId, name: plan.backup1.name, role: 'Backup1' as const },
    { empId: plan.backup2EmpId, name: plan.backup2.name, role: 'Backup2' as const },
  ];

  const reasonNotes: string[] = [];

  for (const c of candidates) {
    const availability = await availabilityFor(c.empId, date);
    const shift = await effectiveShiftFor(c.empId, date);
    const eligible = availability === 'WORK' && shift !== 'NONE';
    if (eligible) {
      return {
        assignedEmpId: c.empId,
        assignedName: c.name,
        reason: c.role,
        reasonNotes: [`${c.role}`],
      };
    }
    if (availability === 'LEAVE') reasonNotes.push(`${c.name} (${c.role}): on leave`);
    else if (availability === 'OFF') reasonNotes.push(`${c.name} (${c.role}): off`);
    else if (shift === 'NONE') reasonNotes.push(`${c.name} (${c.role}): not on shift`);
  }

  return {
    assignedEmpId: null,
    assignedName: null,
    reason: 'UNASSIGNED',
    reasonNotes,
  };
}
