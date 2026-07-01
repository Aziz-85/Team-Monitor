/**
 * Tasks export workbook for Reports Export Center.
 * Uses task schedules, assignment logic, and TaskCompletion (same as task list/monitor).
 */

import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { addSheetFromRows } from '@/lib/services/scheduleFullExport';
import { getDatesInRange, dayName } from '@/lib/services/reportExportCommon';
import { formatDateRiyadh, getRiyadhNow } from '@/lib/time';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';

export type TasksReportExportOptions = {
  startDate: string;
  endDate: string;
  boutiqueIds: string[];
  boutiqueLabelsById: Map<string, string>;
  empIdFilter?: string;
  includeSummary: boolean;
  includeTaskList: boolean;
  includeOverdue: boolean;
  includeCompleted: boolean;
  includeEmployeePerformance: boolean;
};

type TaskExportRow = Record<string, string | number | boolean>;

type CollectedTask = {
  taskId: string;
  title: string;
  dueDate: string;
  boutiqueId: string;
  boutiqueName: string;
  assignedTo: string;
  assignedEmpId: string | null;
  status: string;
  assignReason: string;
  completedAt: string;
  completedBy: string;
  isCompleted: boolean;
  isOverdue: boolean;
};

const TASK_INCLUDE = {
  taskSchedules: true,
  taskPlans: {
    include: {
      primary: { select: { empId: true, name: true } },
      backup1: { select: { empId: true, name: true } },
      backup2: { select: { empId: true, name: true } },
    },
  },
} as const;

export async function buildTasksReportExportWorkbook(
  options: TasksReportExportOptions
): Promise<{ buffer: ArrayBuffer; startDate: string; endDate: string }> {
  const { startDate, endDate, boutiqueIds, boutiqueLabelsById, empIdFilter } = options;
  const dateStrs = getDatesInRange(startDate, endDate);
  const todayStr = formatDateRiyadh(getRiyadhNow());

  const allRows: CollectedTask[] = [];

  for (const boutiqueId of boutiqueIds) {
    const boutiqueName = boutiqueLabelsById.get(boutiqueId) ?? boutiqueId;

    const tasks = await prisma.task.findMany({
      where: { active: true, boutiqueId },
      include: TASK_INCLUDE,
    });

    if (tasks.length === 0) continue;

    const taskIds = tasks.map((t) => t.id);
    const users = await prisma.user.findMany({
      where: { employee: { boutiqueId } },
      select: {
        id: true,
        empId: true,
        employee: { select: { name: true } },
      },
    });
    const empIdToUserId = new Map(users.filter((u) => u.empId).map((u) => [u.empId!, u.id]));

    const completions = await prisma.taskCompletion.findMany({
      where: { taskId: { in: taskIds }, undoneAt: null },
      include: {
        user: { select: { id: true, empId: true, employee: { select: { name: true } } } },
      },
    });
    const completionByTaskUser = new Map(
      completions.map((c) => [
        `${c.taskId}:${c.userId}`,
        {
          completedAt: c.completedAt.toISOString(),
          completedBy: c.user.employee?.name ?? c.user.empId ?? '',
        },
      ])
    );

    for (const dateStr of dateStrs) {
      const date = new Date(dateStr + 'T12:00:00Z');

      for (const task of tasks) {
        if (!tasksRunnableOnDate(task, date)) continue;
        const assignment = await assignTaskOnDate(task, date);

        if (empIdFilter && assignment.assignedEmpId !== empIdFilter) continue;

        const assigneeUserId = assignment.assignedEmpId
          ? empIdToUserId.get(assignment.assignedEmpId)
          : undefined;
        const completion =
          assigneeUserId != null
            ? completionByTaskUser.get(`${task.id}:${assigneeUserId}`)
            : undefined;
        const isCompleted = !!completion;
        const isOverdue = !isCompleted && dateStr < todayStr;

        let status = 'Open';
        if (isCompleted) status = 'Completed';
        else if (isOverdue) status = 'Overdue';

        allRows.push({
          taskId: task.taskKey ?? task.id,
          title: task.name,
          dueDate: dateStr,
          boutiqueId,
          boutiqueName,
          assignedTo: assignment.assignedName ?? '',
          assignedEmpId: assignment.assignedEmpId,
          status,
          assignReason: assignment.reason,
          completedAt: completion?.completedAt ?? '',
          completedBy: completion?.completedBy ?? '',
          isCompleted,
          isOverdue,
        });
      }
    }
  }

  allRows.sort((a, b) => {
    const d = a.dueDate.localeCompare(b.dueDate);
    if (d !== 0) return d;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  const toExcelRow = (r: CollectedTask): TaskExportRow => ({
    'Task ID': r.taskId,
    Title: r.title,
    Description: '',
    Status: r.status,
    Priority: '',
    'Assigned To': r.assignedTo,
    Boutique: r.boutiqueName,
    'Created At': '',
    'Due Date': r.dueDate,
    'Completed At': r.completedAt,
    'Completed By': r.completedBy,
    Notes: r.assignReason,
  });

  const taskListRows = allRows.map(toExcelRow);
  const overdueRows = allRows.filter((r) => r.isOverdue).map(toExcelRow);
  const completedRows = allRows.filter((r) => r.isCompleted).map(toExcelRow);

  const summaryByDate = new Map<
    string,
    { total: number; completed: number; overdue: number; open: number }
  >();
  for (const r of allRows) {
    const cur = summaryByDate.get(r.dueDate) ?? { total: 0, completed: 0, overdue: 0, open: 0 };
    cur.total += 1;
    if (r.isCompleted) cur.completed += 1;
    else if (r.isOverdue) cur.overdue += 1;
    else cur.open += 1;
    summaryByDate.set(r.dueDate, cur);
  }
  const summaryRows: TaskExportRow[] = Array.from(summaryByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      Date: date,
      Day: dayName(date),
      'Total Tasks': v.total,
      Completed: v.completed,
      Overdue: v.overdue,
      Open: v.open,
    }));

  const perfByEmployee = new Map<
    string,
    { name: string; assigned: number; completed: number }
  >();
  for (const r of allRows) {
    if (!r.assignedTo) continue;
    const cur = perfByEmployee.get(r.assignedTo) ?? { name: r.assignedTo, assigned: 0, completed: 0 };
    cur.assigned += 1;
    if (r.isCompleted) cur.completed += 1;
    perfByEmployee.set(r.assignedTo, cur);
  }
  const performanceRows: TaskExportRow[] = Array.from(perfByEmployee.values())
    .map((v) => ({
      Employee: v.name,
      Assigned: v.assigned,
      Completed: v.completed,
      'Completion Rate %':
        v.assigned > 0 ? Math.round((v.completed * 1000) / v.assigned) / 10 : '',
    }))
    .sort((a, b) => String(a.Employee).localeCompare(String(b.Employee), undefined, { sensitivity: 'base' }));

  const taskHeaders = [
    'Task ID',
    'Title',
    'Description',
    'Status',
    'Priority',
    'Assigned To',
    'Boutique',
    'Created At',
    'Due Date',
    'Completed At',
    'Completed By',
    'Notes',
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Team Monitor';
  workbook.created = new Date();

  if (options.includeSummary) {
    addSheetFromRows(workbook, 'Task Summary', ['Date', 'Day', 'Total Tasks', 'Completed', 'Overdue', 'Open'], summaryRows);
  }
  if (options.includeTaskList) {
    addSheetFromRows(workbook, 'Task List', taskHeaders, taskListRows);
  }
  if (options.includeOverdue && overdueRows.length > 0) {
    addSheetFromRows(workbook, 'Overdue Tasks', taskHeaders, overdueRows);
  }
  if (options.includeCompleted && completedRows.length > 0) {
    addSheetFromRows(workbook, 'Completed Tasks', taskHeaders, completedRows);
  }
  if (options.includeEmployeePerformance) {
    addSheetFromRows(
      workbook,
      'Employee Task Performance',
      ['Employee', 'Assigned', 'Completed', 'Completion Rate %'],
      performanceRows
    );
  }

  if (workbook.worksheets.length === 0) {
    addSheetFromRows(workbook, 'Task Summary', ['Date', 'Note'], [
      { Date: startDate, Note: 'No tasks in selected range' },
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, startDate, endDate };
}
