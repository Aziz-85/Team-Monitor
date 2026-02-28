/**
 * Emit task_due_soon (due tomorrow) and task_overdue (due before today) for tasks in KSA date.
 * Call from cron daily (e.g. morning KSA).
 */

import { prisma } from '@/lib/db';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { emitEvent } from './emitEvent';

function getKsaDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getTodayKsa(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
}

/**
 * Emit due_soon for tasks due tomorrow and overdue for tasks due before today.
 * Uses todayKsa as "today" (default: current KSA date).
 */
export async function emitTaskReminders(todayKsa?: Date): Promise<{ dueSoon: number; overdue: number }> {
  const today = todayKsa ?? getTodayKsa();
  const todayStr = getKsaDateStr(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getKsaDateStr(tomorrow);

  const boutiques = await prisma.boutique.findMany({ select: { id: true } });
  let dueSoonCount = 0;
  let overdueCount = 0;

  for (const { id: boutiqueId } of boutiques) {
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

    for (const task of tasks) {
      const runTomorrow = tasksRunnableOnDate(task, new Date(tomorrowStr + 'T00:00:00Z'));
      if (runTomorrow) {
        const assignment = await assignTaskOnDate(task, new Date(tomorrowStr + 'T00:00:00Z'));
        if (assignment.assignedEmpId) {
          const user = await prisma.user.findUnique({
            where: { empId: assignment.assignedEmpId },
            select: { id: true },
          });
          if (user) {
            await emitEvent('TASK_DUE_SOON', {
              boutiqueId,
              affectedUserIds: [user.id],
              payload: {
                taskId: task.id,
                dueDate: tomorrowStr,
                taskTitle: task.name,
                bucket: tomorrowStr,
              },
            });
            dueSoonCount++;
          }
        }
      }
    }

    for (const task of tasks) {
      const runToday = tasksRunnableOnDate(task, new Date(todayStr + 'T00:00:00Z'));
      if (!runToday) continue;
      const assignment = await assignTaskOnDate(task, new Date(todayStr + 'T00:00:00Z'));
      if (!assignment.assignedEmpId) continue;
      const user = await prisma.user.findUnique({
        where: { empId: assignment.assignedEmpId },
        select: { id: true },
      });
      if (!user) continue;
      const completion = await prisma.taskCompletion.findFirst({
        where: { taskId: task.id, userId: user.id, undoneAt: null },
      });
      if (completion) continue;
      await emitEvent('TASK_OVERDUE', {
        boutiqueId,
        affectedUserIds: [user.id],
        payload: {
          taskId: task.id,
          dueDate: todayStr,
          taskTitle: task.name,
          bucket: todayStr,
        },
      });
      overdueCount++;
    }
  }

  return { dueSoon: dueSoonCount, overdue: overdueCount };
}
