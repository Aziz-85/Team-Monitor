/**
 * Planner Export v2 – Power Automate–friendly CSV.
 * Spec: TaskKey, PlannerTitle, Title, AssigneeEmail, AssigneeDisplayName,
 *       BucketName, DueDateTime, StartDateTime, Notes, PeriodKey, WeekRange.
 * Export MUST fail if any task in scope has taskKey = null (fail-fast).
 */

import { prisma } from '@/lib/db';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { getTasksInScopeForWeek } from './ensureTaskKeys';
import { getWeekStartFromPeriodKey, getTypeCode } from './taskKey';
import { getWeekStatus } from '@/lib/services/scheduleLock';

export type PlannerV2Row = {
  TaskKey: string;
  PlannerTitle: string;
  Title: string;
  AssigneeEmail: string;
  AssigneeDisplayName: string;
  BucketName: string;
  DueDateTime: string;
  StartDateTime: string;
  Notes: string;
  PeriodKey: string;
  WeekRange: string;
};

/** Human week range e.g. "Sat 14 Feb – Fri 20 Feb" (Saturday–Friday). */
export function formatWeekRangeHuman(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** DueDateTime ISO8601 Asia/Riyadh, 09:00 local when only date is stored. */
export function toDueDateTimeRiyadh(dateStr: string): string {
  return `${dateStr}T09:00:00+03:00`;
}

/**
 * Map task type/name to Planner bucket. Does not change task rules; output mapping only.
 */
export function getBucketName(taskName: string, typeCode: string): string {
  const n = taskName.toLowerCase();
  if (typeCode === 'DLY') return 'Daily Operations';
  if (typeCode === 'WKY') {
    if (/\b(inventory|zone)\b/.test(n) || /weekly.*inventory|zone.*inventory/i.test(n))
      return 'Inventory & Zones';
    if (/\b(follow|client)\b/.test(n)) return 'Follow-ups & Clients';
    if (/\b(admin|internal)\b/.test(n)) return 'Admin & Internal';
    return 'Weekly Tasks';
  }
  if (typeCode === 'MLY') {
    if (/\b(inventory|zone)\b/.test(n)) return 'Inventory & Zones';
    if (/\b(follow|client)\b/.test(n)) return 'Follow-ups & Clients';
    if (/\b(admin|internal)\b/.test(n)) return 'Admin & Internal';
    return 'Weekly Tasks';
  }
  return 'Weekly Tasks';
}

/**
 * Build v2 rows for an approved WEEK. Uses same scope as sync/compare (getTasksInScopeForWeek).
 * FAIL FAST: throws if any task in scope has taskKey = null.
 */
export async function getPlannerV2RowsForWeek(
  periodKey: string,
  boutiqueId: string
): Promise<{ rows: PlannerV2Row[]; weekRange: string }> {
  const weekStart = getWeekStartFromPeriodKey(periodKey);
  if (!weekStart) throw new Error('Invalid periodKey for WEEK');
  const status = await getWeekStatus(weekStart, boutiqueId);
  if (status?.status !== 'APPROVED') throw new Error('Week not approved');

  const tasksInScope = await getTasksInScopeForWeek(prisma, weekStart);
  const withNullKey = tasksInScope.filter((t) => !t.taskKey);
  if (withNullKey.length > 0) {
    throw new Error(
      'Export blocked: some tasks are missing taskKey. Re-approve week or fix key generation.'
    );
  }

  const weekRange = formatWeekRangeHuman(weekStart);
  const start = new Date(weekStart + 'T00:00:00Z');

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

  const rows: PlannerV2Row[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const dueDateTime = toDueDateTimeRiyadh(dateStr);
    for (const task of tasks) {
      if (!task.taskKey) continue;
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      const type = task.taskSchedules[0]?.type ?? 'WEEKLY';
      const typeCode = getTypeCode(type);
      const plannerTitle = `[${task.taskKey}] ${task.name}`;
      if (!plannerTitle.startsWith('[' + task.taskKey + ']')) {
        throw new Error('PlannerTitle must include [TaskKey] prefix');
      }
      const notes = a.reason && a.reason !== 'UNASSIGNED' ? `${typeCode} ${a.reason}` : typeCode;
      rows.push({
        TaskKey: task.taskKey,
        PlannerTitle: plannerTitle,
        Title: task.name,
        AssigneeEmail: a.assignedEmpId ? emailByEmpId[a.assignedEmpId] ?? '' : '',
        AssigneeDisplayName: a.assignedName ?? '',
        BucketName: getBucketName(task.name, typeCode),
        DueDateTime: dueDateTime,
        StartDateTime: '',
        Notes: notes,
        PeriodKey: periodKey,
        WeekRange: weekRange,
      });
    }
  }
  return { rows, weekRange };
}

const V2_HEADERS =
  'TaskKey,PlannerTitle,Title,AssigneeEmail,AssigneeDisplayName,BucketName,DueDateTime,StartDateTime,Notes,PeriodKey,WeekRange';

function escapeCsvCell(s: string): string {
  const t = String(s ?? '');
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** Serialize v2 rows to CSV with correct escaping. */
export function plannerV2RowsToCsv(rows: PlannerV2Row[]): string {
  const lines = [
    V2_HEADERS,
    ...rows.map((r) =>
      [
        r.TaskKey,
        r.PlannerTitle,
        r.Title,
        r.AssigneeEmail,
        r.AssigneeDisplayName,
        r.BucketName,
        r.DueDateTime,
        r.StartDateTime,
        r.Notes,
        r.PeriodKey,
        r.WeekRange,
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ];
  return lines.join('\r\n');
}
