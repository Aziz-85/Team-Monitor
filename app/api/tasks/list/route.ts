import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
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

function getKsaToday(): { dateStr: string; date: Date } {
  const now = new Date();
  const ksaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  const year = ksaNow.getFullYear();
  const month = String(ksaNow.getMonth() + 1).padStart(2, '0');
  const day = String(ksaNow.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  return { dateStr, date: new Date(`${dateStr}T00:00:00Z`) };
}

function getKsaWeekDates(todayStr: string): string[] {
  const d = new Date(todayStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = (day - 6 + 7) % 7;
  const sat = new Date(d);
  sat.setUTCDate(sat.getUTCDate() - diff);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(sat);
    x.setUTCDate(sat.getUTCDate() + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

function getOverdueDates(todayStr: string, capDays: number): string[] {
  const out: string[] = [];
  const end = new Date(todayStr + 'T00:00:00Z');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - capDays);
  const cur = new Date(start);
  while (cur < end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { scope, res } = await requireOperationalScope(request);
  if (res) return res;
  const boutiqueId = scope.boutiqueId;
  const userId = scope.userId;
  const empId = scope.empId;

  const { dateStr } = getKsaToday();
  const period = request.nextUrl.searchParams.get('period') ?? 'today';
  const statusFilter = request.nextUrl.searchParams.get('status') ?? 'all';
  const assignedFilter = request.nextUrl.searchParams.get('assigned') ?? 'me';
  const search = (request.nextUrl.searchParams.get('search') ?? '').trim().toLowerCase();

  const isManagerOrAdmin = scope.role === 'MANAGER' || scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN';
  const canSeeAll = isManagerOrAdmin && assignedFilter === 'all';

  let dateStrs: string[];
  if (period === 'today') {
    dateStrs = [dateStr];
  } else if (period === 'week') {
    dateStrs = getKsaWeekDates(dateStr);
  } else if (period === 'overdue') {
    dateStrs = getOverdueDates(dateStr, 60);
  } else {
    const overdue = getOverdueDates(dateStr, 60);
    const week = getKsaWeekDates(dateStr);
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
          where: { userId, taskId: { in: taskIds } },
        })
      : [];
  const completedTaskIds = new Set(
    completions.filter((c) => c.undoneAt == null).map((c) => c.taskId)
  );

  const rows: TaskListRow[] = [];

  for (const dateStrItem of dateStrs) {
    const date = new Date(dateStrItem + 'T00:00:00Z');
    const isToday = dateStrItem === dateStr;

    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);

      if (!canSeeAll && a.assignedEmpId !== empId) continue;

      const assigneeName = a.assignedName ?? null;
      const assigneeEmpId = a.assignedEmpId;
      const isCompleted = isToday && completedTaskIds.has(task.id);

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
