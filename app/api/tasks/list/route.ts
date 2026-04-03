import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import {
  getOverdueYmdKeysBefore,
  getRiyadhTaskListToday,
  getSaturdayWeekYmdKeysForAnchor,
} from '@/lib/tasks/taskListDates';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
export type TaskListRow = {
  taskId: string;
  title: string;
  dueDate: string;
  assigneeName: string | null;
  assigneeEmpId: string | null;
  isCompleted: boolean;
  isMine: boolean;
  reason: string;
};

export async function GET(request: NextRequest) {
  const { scope, res } = await requireOperationalScope(request);
  if (res) return res;
  const boutiqueId = scope.boutiqueId;
  const userId = scope.userId;
  const empId = scope.empId;

  const { dateStr } = getRiyadhTaskListToday();
  const isManagerOrAdmin = scope.role === 'MANAGER' || scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN';
  /** Defaults match /tasks/monitor (this week) and manager view (all assignees). */
  const period = request.nextUrl.searchParams.get('period') ?? 'week';
  const statusFilter = request.nextUrl.searchParams.get('status') ?? 'all';
  const assignedFilter = request.nextUrl.searchParams.get('assigned') ?? (isManagerOrAdmin ? 'all' : 'me');
  const search = (request.nextUrl.searchParams.get('search') ?? '').trim().toLowerCase();

  const canSeeAll = isManagerOrAdmin && assignedFilter === 'all';

  let dateStrs: string[];
  if (period === 'today') {
    dateStrs = [dateStr];
  } else if (period === 'week') {
    dateStrs = getSaturdayWeekYmdKeysForAnchor(dateStr);
  } else if (period === 'overdue') {
    dateStrs = getOverdueYmdKeysBefore(dateStr, 60);
  } else {
    const overdue = getOverdueYmdKeysBefore(dateStr, 60);
    const week = getSaturdayWeekYmdKeysForAnchor(dateStr);
    const set = new Set<string>([...overdue, dateStr, ...week]);
    dateStrs = Array.from(set).sort();
  }

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

  const taskIds = tasks.map((t) => t.id);
  const completions =
    taskIds.length > 0
      ? await prisma.taskCompletion.findMany({
          where: {
            taskId: { in: taskIds },
            ...(canSeeAll ? {} : { userId }),
          },
        })
      : [];
  const completedByTaskUser = new Set(
    completions.filter((c) => c.undoneAt == null).map((c) => `${c.taskId}::${c.userId}`)
  );

  const empIdToUserId = new Map<string, string>();
  if (canSeeAll) {
    const users = await prisma.user.findMany({
      where: { employee: { boutiqueId } },
      select: { id: true, empId: true },
    });
    for (const u of users) empIdToUserId.set(u.empId, u.id);
  }

  const rows: TaskListRow[] = [];

  for (const dateStrItem of dateStrs) {
    const date = new Date(dateStrItem + 'T00:00:00Z');

    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);

      if (!canSeeAll && a.assignedEmpId !== empId) continue;

      const assigneeName = a.assignedName ?? null;
      const assigneeEmpId = a.assignedEmpId;

      const assigneeUserId = assigneeEmpId
        ? (canSeeAll ? empIdToUserId.get(assigneeEmpId) : (assigneeEmpId === empId ? userId : undefined))
        : undefined;
      const isCompleted = assigneeUserId
        ? completedByTaskUser.has(`${task.id}::${assigneeUserId}`)
        : false;

      if (statusFilter === 'open' && isCompleted) continue;
      if (statusFilter === 'done' && !isCompleted) continue;

      if (search && !(task.name || '').toLowerCase().includes(search)) continue;

      const isMine = assigneeEmpId === empId;

      rows.push({
        taskId: task.id,
        title: task.name,
        dueDate: dateStrItem,
        assigneeName,
        assigneeEmpId,
        isCompleted,
        isMine,
        reason: a.reason,
      });
    }
  }

  rows.sort((a, b) => {
    const d = a.dueDate.localeCompare(b.dueDate);
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });

  return NextResponse.json({ tasks: rows, dateStr });
}
