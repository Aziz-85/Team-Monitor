/**
 * Team Today — members list with shift, sales, and tasks for a given date.
 * Used by GET /api/mobile/team/today. Asia/Riyadh date; scope by boutiqueId.
 */

import { prisma } from '@/lib/db';
import {
  addDays,
  normalizeDateOnlyRiyadh,
  toRiyadhDateString,
  getRiyadhNow,
} from '@/lib/time';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { rosterForDate } from '@/lib/services/roster';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import type { Task, TaskPlan, TaskSchedule } from '@prisma/client';

export type TeamTodayShift = 'AM' | 'PM' | 'OFF' | 'LEAVE';

export type TeamTodayMember = {
  empId: string;
  name: string;
  role: string;
  shift: TeamTodayShift;
  salesToday: number;
  tasksDone: number;
  tasksTotal: number;
};

export type TeamTodayResult = {
  date: string;
  members: TeamTodayMember[];
};

function positionToRole(position: string | null): string {
  if (!position) return '—';
  const map: Record<string, string> = {
    BOUTIQUE_MANAGER: 'Manager',
    ASSISTANT_MANAGER: 'Assistant Manager',
    SENIOR_SALES: 'Senior Sales',
    SALES: 'Sales',
  };
  return map[position] ?? position;
}

/**
 * Fetch team today: members with shift, salesToday, tasksDone, tasksTotal.
 * Same data sources as web (boutique employees, roster for shift, SalesEntry, TaskCompletion, task assignment).
 */
export async function getTeamToday(
  boutiqueId: string,
  dateStr: string
): Promise<TeamTodayResult> {
  const dayStart = normalizeDateOnlyRiyadh(dateStr);
  const dayEnd = addDays(dayStart, 1);

  const [employees, roster, salesByUser, completionsByUser, tasksWithPlans] = await Promise.all([
    prisma.employee.findMany({
      where: buildEmployeeWhereForOperational([boutiqueId]),
      select: {
        empId: true,
        name: true,
        position: true,
        user: { select: { id: true } },
      },
      orderBy: employeeOrderByStable,
    }),
    rosterForDate(dayStart, { boutiqueIds: [boutiqueId] }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where: { boutiqueId, dateKey: dateStr },
      _sum: { amount: true },
    }),
    prisma.taskCompletion.findMany({
      where: {
        undoneAt: null,
        completedAt: { gte: dayStart, lt: dayEnd },
        task: { boutiqueId },
      },
      select: { userId: true },
    }),
    prisma.task.findMany({
      where: { active: true, boutiqueId },
      select: {
        id: true,
        taskSchedules: true,
        taskPlans: {
          select: {
            primaryEmpId: true,
            backup1EmpId: true,
            backup2EmpId: true,
            primary: { select: { empId: true, name: true } },
            backup1: { select: { empId: true, name: true } },
            backup2: { select: { empId: true, name: true } },
          },
        },
      },
    }),
  ]);

  const salesMap = new Map<string, number>();
  for (const row of salesByUser) {
    salesMap.set(row.userId, row._sum.amount ?? 0);
  }
  const completionsCountByUser = new Map<string, number>();
  for (const c of completionsByUser) {
    completionsCountByUser.set(c.userId, (completionsCountByUser.get(c.userId) ?? 0) + 1);
  }

  const shiftByEmpId = new Map<string, TeamTodayShift>();
  for (const e of roster.amEmployees) shiftByEmpId.set(e.empId, 'AM');
  for (const e of roster.pmEmployees) shiftByEmpId.set(e.empId, 'PM');
  for (const e of roster.offEmployees) shiftByEmpId.set(e.empId, 'OFF');
  for (const e of roster.leaveEmployees) shiftByEmpId.set(e.empId, 'LEAVE');

  const tasksTotalByEmpId = new Map<string, number>();
  const taskList = tasksWithPlans as (Task & {
    taskSchedules: TaskSchedule[];
    taskPlans: (TaskPlan & {
      primary: { empId: string; name: string };
      backup1: { empId: string; name: string };
      backup2: { empId: string; name: string };
    })[];
  })[];
  for (const task of taskList) {
    if (!tasksRunnableOnDate(task, dayStart)) continue;
    const plan = task.taskPlans[0];
    if (!plan) continue;
    const result = await assignTaskOnDate(task, dayStart);
    if (result.assignedEmpId) {
      tasksTotalByEmpId.set(
        result.assignedEmpId,
        (tasksTotalByEmpId.get(result.assignedEmpId) ?? 0) + 1
      );
    }
  }

  const members: TeamTodayMember[] = employees.map((emp) => {
    const userId = emp.user?.id;
    const shift = shiftByEmpId.get(emp.empId) ?? 'OFF';
    const salesToday = userId ? salesMap.get(userId) ?? 0 : 0;
    const tasksDone = userId ? completionsCountByUser.get(userId) ?? 0 : 0;
    const tasksTotal = tasksTotalByEmpId.get(emp.empId) ?? 0;
    return {
      empId: emp.empId,
      name: emp.name,
      role: positionToRole(emp.position),
      shift,
      salesToday,
      tasksDone,
      tasksTotal,
    };
  });

  return { date: dateStr, members };
}

export function getDefaultTeamTodayDate(): string {
  return toRiyadhDateString(getRiyadhNow());
}
