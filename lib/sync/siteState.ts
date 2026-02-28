import { prisma } from '@/lib/db';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { getWeekStartFromPeriodKey } from './taskKey';
import { getWeekStatus } from '@/lib/services/scheduleLock';

export type SiteTaskOccurrence = {
  taskKey: string;
  taskId: string;
  dueDate: string;
  assigneeEmpId: string | null;
  assigneeName: string | null;
  siteDone: boolean;
  siteCompletedAt: string | null;
  title: string;
};

/**
 * Get all task occurrences for an approved period (for compare).
 */
export async function getSiteStateForPeriod(
  periodType: 'WEEK' | 'MONTH',
  periodKey: string,
  boutiqueId: string
): Promise<SiteTaskOccurrence[]> {
  const dateStrs: string[] = [];
  if (periodType === 'WEEK') {
    const weekStart = getWeekStartFromPeriodKey(periodKey);
    if (!weekStart) throw new Error('Invalid periodKey for WEEK');
    const status = await getWeekStatus(weekStart, boutiqueId);
    if (status?.status !== 'APPROVED') throw new Error('Week not approved');
    const start = new Date(weekStart + 'T00:00:00Z');
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      dateStrs.push(d.toISOString().slice(0, 10));
    }
  } else {
    const m = periodKey.match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new Error('Invalid periodKey for MONTH');
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    const weekStartsInMonth = new Set<string>();
    for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
      dateStrs.push(d.toISOString().slice(0, 10));
      const day = d.getUTCDay();
      const sat = new Date(d);
      sat.setUTCDate(sat.getUTCDate() - (day === 0 ? 6 : day + 1));
      weekStartsInMonth.add(sat.toISOString().slice(0, 10));
    }
    let anyApproved = false;
    for (const ws of Array.from(weekStartsInMonth)) {
      const st = await getWeekStatus(ws, boutiqueId);
      if (st?.status === 'APPROVED') {
        anyApproved = true;
        break;
      }
    }
    if (!anyApproved) throw new Error('No approved week in month');
  }

  const tasks = await prisma.task.findMany({
    where: { active: true },
    include: {
      taskSchedules: true,
      taskPlans: { include: { primary: true, backup1: true, backup2: true } },
      completions: { where: { undoneAt: null }, select: { userId: true, completedAt: true } },
    },
  });

  const users = await prisma.user.findMany({
    select: { id: true, empId: true },
  });
  const empIdByUserId = Object.fromEntries(users.map((u) => [u.id, u.empId]));
  const out: SiteTaskOccurrence[] = [];
  for (const dateStr of dateStrs) {
    const date = new Date(dateStr + 'T00:00:00Z');
    for (const task of tasks) {
      if (!task.taskKey) continue;
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      const completion = task.completions.find((c) => empIdByUserId[c.userId] === a.assignedEmpId);
      const siteDone = !!completion;
      const siteCompletedAt = completion ? completion.completedAt.toISOString() : null;
      out.push({
        taskKey: task.taskKey,
        taskId: task.id,
        dueDate: dateStr,
        assigneeEmpId: a.assignedEmpId,
        assigneeName: a.assignedName ?? null,
        siteDone,
        siteCompletedAt,
        title: task.name,
      });
    }
  }
  return out;
}
