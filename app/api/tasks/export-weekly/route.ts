import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import type { Role } from '@prisma/client';

type TaskRow = {
  title: string;
  dueDate: string;
  empId: string | null;
  taskId: string;
};

function getTodayKsa(): Date {
  const now = new Date();
  const ksaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  ksaNow.setHours(0, 0, 0, 0);
  return ksaNow;
}

function getWeekStartSaturday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat (local)
  const diff = (day - 6 + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function iterateDates(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { scope, res } = await requireOperationalScope(request);
  if (res) return res;
  const boutiqueId = scope!.boutiqueId;

  const weekStartParam = request.nextUrl.searchParams.get('weekStart');

  let weekStartDate: Date;
  if (weekStartParam) {
    const parsed = new Date(weekStartParam + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid weekStart (YYYY-MM-DD)' }, { status: 400 });
    }
    weekStartDate = parsed;
  } else {
    weekStartDate = getWeekStartSaturday(getTodayKsa());
  }

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);

  const dateRange = iterateDates(weekStartDate, weekEndDate);

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

  const rows: TaskRow[] = [];

  for (const date of dateRange) {
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      if (!a.assignedEmpId) continue;

      const dueDateStr = date.toISOString().slice(0, 10);

      rows.push({
        title: task.name,
        dueDate: dueDateStr,
        empId: a.assignedEmpId,
        taskId: task.id,
      });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No tasks in this week' }, { status: 404 });
  }

  // Filter out tasks that are already marked as Done in the app
  const taskIds = Array.from(new Set(rows.map((r) => r.taskId)));
  const doneCompletions =
    taskIds.length > 0
      ? await prisma.taskCompletion.findMany({
          where: {
            taskId: { in: taskIds },
            undoneAt: null,
          },
        })
      : [];
  const doneTaskIds = new Set(doneCompletions.map((c) => c.taskId));
  const openRows = rows.filter((r) => !doneTaskIds.has(r.taskId));

  if (openRows.length === 0) {
    return NextResponse.json({ error: 'No open tasks in this week' }, { status: 404 });
  }

  const empIds = Array.from(new Set(openRows.map((r) => r.empId).filter((e): e is string => !!e)));
  const employees =
    empIds.length > 0
      ? await prisma.employee.findMany({
          where: { empId: { in: empIds } },
          select: { empId: true, email: true },
        })
      : [];
  const emailByEmp = new Map(employees.map((e) => [e.empId, e.email ?? '']));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('PlannerImport');

  sheet.columns = [
    { header: 'Title', key: 'Title', width: 40 },
    { header: 'DueDate', key: 'DueDate', width: 15 },
    { header: 'AssignedToEmail', key: 'AssignedToEmail', width: 30 },
    { header: 'Bucket', key: 'Bucket', width: 20 },
    { header: 'Notes', key: 'Notes', width: 40 },
    { header: 'SourceTaskId', key: 'SourceTaskId', width: 36 },
  ];

  for (const r of openRows) {
    const email = r.empId ? emailByEmp.get(r.empId) ?? '' : '';
    const sourceId = `${r.taskId}:${r.dueDate}:${r.empId ?? ''}`;
    sheet.addRow({
      Title: r.title,
      DueDate: r.dueDate,
      AssignedToEmail: email,
      Bucket: '',
      Notes: '',
      SourceTaskId: sourceId,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const weekStartStr = weekStartDate.toISOString().slice(0, 10);

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="weekly-tasks-${weekStartStr}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

