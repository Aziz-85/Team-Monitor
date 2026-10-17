import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { normalizeDateOnlyRiyadh } from '@/lib/time';
import { getTaskTrackingLaunchDate } from '@/lib/tasks/taskTrackingPolicy';

type ToggleAction = 'done' | 'undo';

function getTodayDateInKsa(): { dateStr: string; date: Date } {
  const dateStr = getRiyadhDateKey();
  return { dateStr, date: normalizeDateOnlyRiyadh(dateStr) };
}

export async function POST(request: NextRequest) {
  const { scope, res } = await requireOperationalScope(request);
  if (res) return res;
  const boutiqueId = scope.boutiqueId;
  const userId = scope.userId;
  const empId = scope.empId;
  const isManager = scope.role === 'MANAGER' || scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN';

  const body = (await request.json().catch(() => null)) as {
    taskId?: string;
    action?: ToggleAction;
    dueDate?: string;
    assigneeEmpId?: string;
  } | null;
  const taskId = body?.taskId;
  const action = body?.action;

  if (!taskId || (action !== 'done' && action !== 'undo')) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { dateStr: todayStr } = getTodayDateInKsa();
  const dueDateStr = body?.dueDate ?? todayStr;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) {
    return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });
  }
  const dueDate = new Date(`${dueDateStr}T00:00:00Z`);
  if (Number.isNaN(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== dueDateStr) {
    return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });
  }
  if (dueDateStr > todayStr) {
    return NextResponse.json({ error: 'Future tasks cannot be completed yet' }, { status: 400 });
  }
  const launchDate = await getTaskTrackingLaunchDate();
  if (dueDateStr < launchDate) {
    return NextResponse.json(
      { error: `Task tracking starts on ${launchDate}; earlier dates are not scored` },
      { status: 400 }
    );
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, boutiqueId },
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

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (!tasksRunnableOnDate(task, dueDate)) {
    return NextResponse.json({ error: 'Task not scheduled for this date' }, { status: 400 });
  }

  const assignment = await assignTaskOnDate(task, dueDate);

  let targetUserId = userId;

  if (isManager && body?.assigneeEmpId && body.assigneeEmpId !== empId) {
    const targetUser = await prisma.user.findFirst({
      where: { empId: body.assigneeEmpId },
      select: { id: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: 'Assigned user not found' }, { status: 404 });
    }
    targetUserId = targetUser.id;
  } else if (assignment.assignedEmpId !== empId && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();

  if (action === 'done') {
    const completion = await prisma.taskCompletion.upsert({
      where: {
        taskId_userId_dueDate: {
          taskId,
          userId: targetUserId,
          dueDate,
        },
      },
      create: {
        taskId,
        userId: targetUserId,
        dueDate,
        completedAt: now,
        undoneAt: null,
      },
      update: {
        completedAt: now,
        undoneAt: null,
      },
    });

    return NextResponse.json({
      taskId,
      isCompleted: true,
      completedAt: completion.completedAt.toISOString(),
    });
  }

  // action === 'undo'
  try {
    const completion = await prisma.taskCompletion.update({
      where: {
        taskId_userId_dueDate: {
          taskId,
          userId: targetUserId,
          dueDate,
        },
      },
      data: {
        undoneAt: now,
      },
    });

    return NextResponse.json({
      taskId,
      isCompleted: false,
      completedAt: completion.completedAt.toISOString(),
    });
  } catch {
    return NextResponse.json({
      taskId,
      isCompleted: false,
      completedAt: null,
    });
  }
}
