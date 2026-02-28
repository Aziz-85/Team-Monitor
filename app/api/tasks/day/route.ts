import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';

export async function GET(request: NextRequest) {
  const { scope, res } = await requireOperationalScope(request);
  if (res) return res;
  const boutiqueId = scope.boutiqueId;
  const empId = scope.empId;

  const dateParam = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateParam + 'T00:00:00Z');

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

  const isManagerOrAdmin = scope.role === 'MANAGER' || scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN';

  const result: Array<{
    taskId: string;
    taskName: string;
    assignedTo: string | null;
    reason: string;
    reasonNotes: string[];
  }> = [];

  for (const task of tasks) {
    if (!tasksRunnableOnDate(task, date)) continue;
    const a = await assignTaskOnDate(task, date);

    if (isManagerOrAdmin) {
      result.push({
        taskId: task.id,
        taskName: task.name,
        assignedTo: a.assignedName ?? a.assignedEmpId,
        reason: a.reason,
        reasonNotes: a.reasonNotes,
      });
    } else {
      if (a.assignedEmpId === empId) {
        result.push({
          taskId: task.id,
          taskName: task.name,
          assignedTo: a.assignedName ?? a.assignedEmpId,
          reason: a.reason,
          reasonNotes: a.reasonNotes,
        });
      }
    }
  }

  return NextResponse.json({ date: dateParam, tasks: result });
}
