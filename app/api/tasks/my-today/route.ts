import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { getOrCreateDailyRun } from '@/lib/services/inventoryDaily';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';

type MyTodayTask = {
  id: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  completedAt?: string | null;
  kind: 'task' | 'inventory';
};

function getTodayDateInKsa(): { dateStr: string; date: Date } {
  const now = new Date();
  const ksaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  const year = ksaNow.getFullYear();
  const month = String(ksaNow.getMonth() + 1).padStart(2, '0');
  const day = String(ksaNow.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const date = new Date(`${dateStr}T00:00:00Z`);
  return { dateStr, date };
}

export async function GET(request: NextRequest) {
  const { scope, res } = await requireOperationalScope(request);
  if (res) return res;
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'Select a boutique in the scope selector.' }, { status: 403 });
  }
  const boutiqueId = scope.boutiqueId;
  const userId = scope.userId;
  const empId = scope.empId;

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dateStr, date } = getTodayDateInKsa();

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

  const assignedToday: MyTodayTask[] = [];

  for (const task of tasks) {
    if (!tasksRunnableOnDate(task, date)) continue;
    const assignment = await assignTaskOnDate(task, date);
    if (assignment.assignedEmpId !== empId) continue;

    assignedToday.push({
      id: task.id,
      title: task.name,
      dueDate: dateStr,
      isCompleted: false,
      kind: 'task',
    });
  }

  let tasksWithStatus: MyTodayTask[] = [];

  if (assignedToday.length > 0) {
    const completions = await prisma.taskCompletion.findMany({
      where: {
        userId,
        taskId: { in: assignedToday.map((t) => t.id) },
      },
    });

    const completionByTaskId = new Map(
      completions.map((c) => [c.taskId, c])
    );

    tasksWithStatus = assignedToday.map((t) => {
      const completion = completionByTaskId.get(t.id);
      const isCompleted = !!completion && completion.undoneAt == null;

      return {
        ...t,
        isCompleted,
        completedAt: completion?.completedAt.toISOString() ?? null,
      };
    });
  }

  // Integrate Daily Inventory as a task for today (if assigned to this user)
  const dailyRun = await getOrCreateDailyRun(boutiqueId, date);
  if (dailyRun.assignedEmpId === empId) {
    const language = user.employee?.language === 'ar' ? 'ar' : 'en';
    const inventoryMessages = language === 'ar' ? (arMessages as typeof enMessages) : enMessages;
    const inventoryTitle =
      (inventoryMessages.inventory?.todayCard as string | undefined) ??
      (inventoryMessages.inventory?.daily as string | undefined) ??
      (language === 'ar' ? 'الجرد اليومي' : 'Daily Inventory');

    tasksWithStatus.push({
      id: `inventory:${dailyRun.runId}`,
      title: inventoryTitle,
      dueDate: dateStr,
      isCompleted: dailyRun.status === 'COMPLETED',
      completedAt: dailyRun.completedAt ? dailyRun.completedAt.toISOString() : null,
      kind: 'inventory',
    });
  }

  return NextResponse.json({ date: dateStr, tasks: tasksWithStatus });
}

