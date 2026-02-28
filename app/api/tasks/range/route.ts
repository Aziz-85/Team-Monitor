import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOperationalScope } from '@/lib/scope/operationalScope';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';

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
  const { scope, res } = await requireOperationalScope(request);
  if (res) return res;
  const boutiqueId = scope.boutiqueId;
  const empId = scope.empId;

  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');
  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to required (YYYY-MM-DD)' }, { status: 400 });
  }

  const from = new Date(fromParam + 'T00:00:00Z');
  const to = new Date(toParam + 'T00:00:00Z');
  const isManagerOrAdmin = scope.role === 'MANAGER' || scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN';

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

  const byDay: Record<string, Array<{
    taskId: string;
    taskName: string;
    assignedTo: string | null;
    reason: string;
    reasonNotes: string[];
  }>> = {};

  for (const date of iterateDates(from, to)) {
    const dateStr = date.toISOString().slice(0, 10);
    byDay[dateStr] = [];

    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      if (isManagerOrAdmin || a.assignedEmpId === empId) {
        byDay[dateStr].push({
          taskId: task.id,
          taskName: task.name,
          assignedTo: a.assignedName ?? a.assignedEmpId,
          reason: a.reason,
          reasonNotes: a.reasonNotes,
        });
      }
    }
  }

  return NextResponse.json({ from: fromParam, to: toParam, byDay });
}
