/**
 * After schedule is published, emit TASK_ASSIGNED for each (user, task, date) in the week.
 */

import { prisma } from '@/lib/db';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { emitEventAsync } from './emitEvent';

export async function emitTaskAssignedForWeek(weekStart: string, boutiqueId: string): Promise<void> {
  const start = new Date(weekStart + 'T00:00:00Z');
  const tasks = await prisma.task.findMany({
    where: { active: true, boutiqueId },
    include: {
      taskSchedules: true,
      taskPlans: {
        include: {
          primary: { select: { empId: true, name: true } },
          backup1: { select: { empId: true, name: true } },
          backup2: { select: { empId: true, name: true } },
        },
      },
    },
  });

  const toEmit: { empId: string; taskId: string; dueDate: string; taskTitle: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, d)) continue;
      const assignment = await assignTaskOnDate(task, d);
      if (assignment.assignedEmpId) {
        toEmit.push({
          empId: assignment.assignedEmpId,
          taskId: task.id,
          dueDate: dateStr,
          taskTitle: task.name,
        });
      }
    }
  }

  if (toEmit.length === 0) return;
  const empIds = Array.from(new Set(toEmit.map((e) => e.empId)));
  const users = await prisma.user.findMany({
    where: { empId: { in: empIds } },
    select: { id: true, empId: true },
  });
  const userIdByEmpId = new Map(users.map((u) => [u.empId, u.id]));
  for (const { empId, taskId, dueDate, taskTitle } of toEmit) {
    const userId = userIdByEmpId.get(empId);
    if (!userId) continue;
    emitEventAsync('TASK_ASSIGNED', {
      boutiqueId,
      affectedUserIds: [userId],
      payload: { taskId, dueDate, taskTitle },
    });
  }
}
