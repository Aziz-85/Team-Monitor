import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { rosterForDate } from '@/lib/services/roster';
import { prisma } from '@/lib/db';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scope = await getOperationalScope(request);
  assertOperationalBoutiqueId(scope?.boutiqueId);
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'No operational boutique available' }, { status: 403 });
  }
  const scopeOptions = { boutiqueIds: scope.boutiqueIds };

  const empId = user.empId;
  const dateParam = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateParam + 'T00:00:00Z');

  const roster = await rosterForDate(date, scopeOptions);
  const myAM = roster.amEmployees.some((e) => e.empId === empId);
  const myPM = roster.pmEmployees.some((e) => e.empId === empId);

  const tasks = await prisma.task.findMany({
    where: { active: true },
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

  const myTasks: Array<{ taskName: string; reason: string }> = [];
  for (const task of tasks) {
    if (!tasksRunnableOnDate(task, date)) continue;
    const a = await assignTaskOnDate(task, date);
    if (a.assignedEmpId === empId) {
      myTasks.push({ taskName: task.name, reason: a.reason });
    }
  }

  return NextResponse.json({
    date: date.toISOString().slice(0, 10),
    todaySchedule: { am: myAM, pm: myPM },
    weekRoster: { am: roster.amEmployees, pm: roster.pmEmployees },
    todayTasks: myTasks,
  });
}
