import { prisma } from '@/lib/db';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { getWeekStartFromPeriodKey, getTypeCode, getZoneFromTaskName, titleWithKey } from './taskKey';
import { getWeekStatus } from '@/lib/services/scheduleLock';

export type ExportRow = {
  taskKey: string;
  titleWithKey: string;
  assigneeEmail: string;
  assigneeName: string;
  dueDate: string;
  type: string;
  zone: string;
  quarter: string;
  weekStart: string;
  weekEnd: string;
};

/**
 * Export tasks for an approved period. Returns rows for CSV/XLSX.
 * WEEK: periodKey e.g. "2026-W13". MONTH: periodKey e.g. "2026-02".
 */
export async function exportSiteTasksForPeriod(
  periodType: 'WEEK' | 'MONTH',
  periodKey: string,
  boutiqueId: string
): Promise<{ rows: ExportRow[]; weekStart?: string; weekEnd?: string }> {
  if (periodType === 'WEEK') {
    const weekStart = getWeekStartFromPeriodKey(periodKey);
    if (!weekStart) throw new Error('Invalid periodKey for WEEK');
    const status = await getWeekStatus(weekStart, boutiqueId);
    if (status?.status !== 'APPROVED') throw new Error('Week not approved');
    const start = new Date(weekStart + 'T00:00:00Z');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekEnd = end.toISOString().slice(0, 10);
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
    const employees = await prisma.employee.findMany({
      where: { active: true },
      select: { empId: true, name: true, email: true },
    });
    const emailByEmpId = Object.fromEntries(employees.map((e) => [e.empId, e.email ?? '']));
    const rows: ExportRow[] = [];
    const year = start.getUTCFullYear();
    const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      for (const task of tasks) {
        if (!task.taskKey) continue;
        if (!tasksRunnableOnDate(task, date)) continue;
        const a = await assignTaskOnDate(task, date);
        const type = task.taskSchedules[0]?.type ?? 'WEEKLY';
        const typeCode = getTypeCode(type);
        const zone = getZoneFromTaskName(task.name);
        rows.push({
          taskKey: task.taskKey,
          titleWithKey: titleWithKey(task.taskKey, task.name),
          assigneeEmail: a.assignedEmpId ? emailByEmpId[a.assignedEmpId] ?? '' : '',
          assigneeName: a.assignedName ?? '',
          dueDate: dateStr,
          type: typeCode,
          zone,
          quarter: `${year}-Q${quarter}`,
          weekStart,
          weekEnd,
        });
      }
    }
    return { rows, weekStart, weekEnd };
  }

  if (periodType === 'MONTH') {
    const m = periodKey.match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new Error('Invalid periodKey for MONTH');
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0));
    const weekStartsInMonth = new Set<string>();
    for (let d = new Date(firstDay); d <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) {
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
    const tasks = await prisma.task.findMany({
      where: { active: true },
      include: { taskSchedules: true, taskPlans: { include: { primary: true, backup1: true, backup2: true } } },
    });
    const employees = await prisma.employee.findMany({
      where: { active: true },
      select: { empId: true, email: true },
    });
    const emailByEmpId = Object.fromEntries(employees.map((e) => [e.empId, e.email ?? '']));
    const rows: ExportRow[] = [];
    const quarter = Math.floor(month / 3) + 1;
    const weekStart = firstDay.toISOString().slice(0, 10);
    const weekEnd = lastDay.toISOString().slice(0, 10);
    for (let d = new Date(firstDay); d <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = new Date(d);
      const dateStr = date.toISOString().slice(0, 10);
      for (const task of tasks) {
        if (!task.taskKey) continue;
        if (!tasksRunnableOnDate(task, date)) continue;
        const a = await assignTaskOnDate(task, date);
        const type = task.taskSchedules[0]?.type ?? 'WEEKLY';
        const typeCode = getTypeCode(type);
        const zone = getZoneFromTaskName(task.name);
        rows.push({
          taskKey: task.taskKey,
          titleWithKey: titleWithKey(task.taskKey, task.name),
          assigneeEmail: a.assignedEmpId ? emailByEmpId[a.assignedEmpId] ?? '' : '',
          assigneeName: a.assignedName ?? '',
          dueDate: dateStr,
          type: typeCode,
          zone,
          quarter: `${year}-Q${quarter}`,
          weekStart,
          weekEnd,
        });
      }
    }
    return { rows, weekStart, weekEnd };
  }

  throw new Error('periodType must be WEEK or MONTH');
}

export function exportRowsToCsv(rows: ExportRow[]): string {
  const header = 'taskKey,titleWithKey,assigneeEmail,assigneeName,dueDate,type,zone,quarter,weekStart,weekEnd';
  const escape = (s: string) => {
    const t = String(s ?? '');
    if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  };
  const lines = [header, ...rows.map((r) => [r.taskKey, r.titleWithKey, r.assigneeEmail, r.assigneeName, r.dueDate, r.type, r.zone, r.quarter, r.weekStart, r.weekEnd].map(escape).join(','))];
  return lines.join('\r\n');
}
