import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { buildEmployeeWhereForOperational } from '@/lib/employee/employeeQuery';
import { employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { parseWeekPeriodKey, getWeekStartFromPeriodKey } from '@/lib/sync/taskKey';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const WINDOW_MINUTES = 3;
const MIN_TASKS_IN_WINDOW = 4;

export type TaskMonitorRow = {
  taskId: string;
  title: string;
  type: string;
  dueDate: string;
  assignedTo: string | null;
  assignedEmpId: string | null;
  status: 'done' | 'pending';
  completedAt: string | null;
  overdue: boolean;
  isValidCompletion: boolean;
  isSuspiciousBurst: boolean;
  completionDelay?: { kind: 'early' | 'onTime' | 'late'; text: string; minutes?: number };
  overdueByDays?: number;
};

export type EmployeeStatRow = {
  empId: string;
  name: string;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  onTimeRate: number;
  avgDelayMinutes: number | null;
};

export type SuspiciousBurstRow = {
  empId: string;
  empName: string;
  burstCount: number;
  biggestBurstSize: number;
  burstStart: string;
  burstEnd: string;
  tasks: { title: string; completedAt: string }[];
};

function getKsaToday(): { dateStr: string } {
  const now = new Date();
  const ksaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  const year = ksaNow.getFullYear();
  const month = String(ksaNow.getMonth() + 1).padStart(2, '0');
  const day = String(ksaNow.getDate()).padStart(2, '0');
  return { dateStr: `${year}-${month}-${day}` };
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

function getKsaMonthDates(todayStr: string): string[] {
  const [y, m] = todayStr.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

function getCustomDates(startStr: string, endStr: string): string[] {
  const start = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function formatDelay(completedAt: Date, dueDateStr: string): { kind: 'early' | 'onTime' | 'late'; text: string; minutes?: number } {
  const endOfDue = new Date(dueDateStr + 'T23:59:59.999Z');
  const ms = completedAt.getTime() - endOfDue.getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes <= 0) {
    if (minutes === 0) return { kind: 'onTime', text: 'on-time' };
    const absM = Math.abs(minutes);
    const hours = Math.floor(absM / 60);
    const days = Math.floor(absM / 1440);
    if (days > 0) return { kind: 'early', text: `early (${days}d)`, minutes };
    if (hours > 0) return { kind: 'early', text: `early (${hours}h)`, minutes };
    return { kind: 'early', text: 'early', minutes };
  }
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(minutes / 1440);
  if (days > 0) return { kind: 'late', text: `late (+${days}d)`, minutes };
  if (hours > 0) return { kind: 'late', text: `late (+${hours}h)`, minutes };
  return { kind: 'late', text: `late (+${minutes}m)`, minutes };
}

function detectBursts(
  completions: { taskId: string; userId: string; completedAt: Date; task: { name: string }; user: { empId: string } }[],
  empIdToName: Map<string, string>
): SuspiciousBurstRow[] {
  const byUser = new Map<string, { taskId: string; completedAt: Date; title: string }[]>();
  for (const c of completions) {
    let list = byUser.get(c.user.empId);
    if (!list) {
      list = [];
      byUser.set(c.user.empId, list);
    }
    list.push({ taskId: c.taskId, completedAt: c.completedAt, title: c.task.name });
  }
  const windowMs = WINDOW_MINUTES * 60 * 1000;
  const result: SuspiciousBurstRow[] = [];
  for (const [empId, list] of Array.from(byUser.entries())) {
    list.sort((a: { completedAt: Date }, b: { completedAt: Date }) => a.completedAt.getTime() - b.completedAt.getTime());
    let burstCount = 0;
    let biggestSize = 0;
    let biggestStart: Date | null = null;
    let biggestEnd: Date | null = null;
    const burstWindows: { start: Date; end: Date; count: number; tasks: typeof list }[] = [];
    for (let i = 0; i < list.length; i++) {
      const t0 = list[i].completedAt.getTime();
      const windowEnd = t0 + windowMs;
      const inWindow = list.filter((t: { completedAt: Date }) => t.completedAt.getTime() >= t0 && t.completedAt.getTime() <= windowEnd);
      if (inWindow.length >= MIN_TASKS_IN_WINDOW) {
        burstCount++;
        burstWindows.push({
          start: list[i].completedAt,
          end: new Date(windowEnd),
          count: inWindow.length,
          tasks: inWindow,
        });
        if (inWindow.length > biggestSize) {
          biggestSize = inWindow.length;
          biggestStart = list[i].completedAt;
          biggestEnd = new Date(windowEnd);
        }
      }
    }
    if (burstCount === 0) continue;
    const biggestBurst = burstWindows.find((w: { count: number }) => w.count === biggestSize);
    result.push({
      empId,
      empName: empIdToName.get(empId) ?? empId,
      burstCount,
      biggestBurstSize: biggestSize,
      burstStart: biggestStart?.toISOString() ?? '',
      burstEnd: biggestEnd?.toISOString() ?? '',
      tasks: (biggestBurst?.tasks ?? []).map((t: { title: string; completedAt: Date }) => ({ title: t.title, completedAt: t.completedAt.toISOString() })),
    });
  }
  result.sort((a: SuspiciousBurstRow, b: SuspiciousBurstRow) => b.biggestBurstSize - a.biggestBurstSize);
  return result;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getOperationalScope(request);
  assertOperationalBoutiqueId(scope?.boutiqueId);
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'No operational boutique available' }, { status: 403 });
  }

  const { dateStr } = getKsaToday();
  const params = request.nextUrl.searchParams;
  const dateRange = params.get('dateRange') ?? 'week';
  const customStart = params.get('start') ?? dateStr;
  const customEnd = params.get('end') ?? dateStr;
  const statusFilter = params.get('status') ?? 'all';
  const assigneeFilter = params.get('assignee') ?? 'all';
  const typeFilter = params.get('type') ?? 'all';
  const search = (params.get('search') ?? '').trim().toLowerCase();
  const onlySuspicious = params.get('onlySuspicious') === '1';
  const startPeriodKeyRaw = (params.get('startPeriodKey') ?? '').trim();

  if (startPeriodKeyRaw && !parseWeekPeriodKey(startPeriodKeyRaw)) {
    return NextResponse.json(
      { error: 'Invalid startPeriodKey; use YYYY-W01 to YYYY-W53 (e.g. 2026-W08)' },
      { status: 400 }
    );
  }
  const weekStartStr = startPeriodKeyRaw ? getWeekStartFromPeriodKey(startPeriodKeyRaw) : null;
  const minCompletedAt = weekStartStr ? new Date(weekStartStr + 'T00:00:00Z') : null;

  let dateStrs: string[];
  if (dateRange === 'today') {
    dateStrs = [dateStr];
  } else if (dateRange === 'week') {
    dateStrs = getKsaWeekDates(dateStr);
  } else if (dateRange === 'month') {
    dateStrs = getKsaMonthDates(dateStr);
  } else {
    dateStrs = getCustomDates(customStart, customEnd);
  }

  const rangeStart = new Date(dateStrs[0] + 'T00:00:00Z');
  const rangeEnd = new Date(dateStrs[dateStrs.length - 1] + 'T23:59:59.999Z');

  const tasks = await prisma.task.findMany({
    where: { active: true, boutiqueId: scope.boutiqueId },
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
  const completionWhereBase: { taskId: { in: string[] }; undoneAt: null; completedAt?: { gte: Date } } = {
    taskId: { in: taskIds },
    undoneAt: null,
  };
  if (minCompletedAt) completionWhereBase.completedAt = { gte: minCompletedAt };

  const completions =
    taskIds.length > 0
      ? await prisma.taskCompletion.findMany({
          where: completionWhereBase,
          include: { user: { select: { empId: true } } },
        })
      : [];
  const completionByTaskEmp = new Map<string, { completedAt: Date }>();
  for (const c of completions) {
    completionByTaskEmp.set(`${c.taskId}:${c.user.empId}`, { completedAt: c.completedAt });
  }

  const burstCompletedGte = minCompletedAt && minCompletedAt.getTime() > rangeStart.getTime() ? minCompletedAt : rangeStart;
  type CompletionForBurst = { taskId: string; userId: string; completedAt: Date; task: { name: string }; user: { empId: string } };
  const completionsForBurst: CompletionForBurst[] =
    taskIds.length > 0
      ? await prisma.taskCompletion.findMany({
          where: {
            taskId: { in: taskIds },
            undoneAt: null,
            completedAt: { gte: burstCompletedGte, lte: rangeEnd },
          },
          include: {
            task: { select: { name: true } },
            user: { select: { empId: true } },
          },
        })
      : [];

  const employees = await prisma.employee.findMany({
    where: buildEmployeeWhereForOperational(scope.boutiqueIds),
    select: { empId: true, name: true },
    orderBy: employeeOrderByStable,
  });
  const empIdToName = new Map(employees.map((e) => [e.empId, e.name]));
  const operationalEmpIds = new Set(employees.map((e) => e.empId));

  const suspiciousBursts = detectBursts(
    completionsForBurst
      .filter((c) => operationalEmpIds.has(c.user.empId))
      .map((c) => ({
        taskId: c.taskId,
        userId: c.userId,
        completedAt: c.completedAt,
        task: c.task,
        user: c.user,
      })),
    empIdToName
  );
  const suspiciousSet = new Set<string>();
  for (const b of suspiciousBursts) {
    for (const t of b.tasks) {
      const comp = completionsForBurst.find(
        (c) =>
          c.user.empId === b.empId &&
          c.task.name === t.title &&
          c.completedAt.toISOString() === t.completedAt
      );
      if (comp) suspiciousSet.add(`${comp.taskId}:${comp.user.empId}`);
    }
  }

  const rows: TaskMonitorRow[] = [];
  for (const dateStrItem of dateStrs) {
    const date = new Date(dateStrItem + 'T00:00:00Z');
    const dueDateStart = new Date(dateStrItem + 'T00:00:00Z');
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      const type = task.taskSchedules[0]?.type ?? 'DAILY';
      const comp = a.assignedEmpId ? completionByTaskEmp.get(`${task.id}:${a.assignedEmpId}`) : null;
      const taskEmpKey = a.assignedEmpId ? `${task.id}:${a.assignedEmpId}` : '';
      const inSuspiciousSet = !!taskEmpKey && suspiciousSet.has(taskEmpKey);
      const completedAtInRange =
        comp != null &&
        comp.completedAt.getTime() >= rangeStart.getTime() &&
        comp.completedAt.getTime() <= rangeEnd.getTime();
      const completedAtNotBeforeDue = comp != null && comp.completedAt.getTime() >= dueDateStart.getTime();
      const isValidCompletion = !!(comp != null && completedAtNotBeforeDue && completedAtInRange);
      const isSuspiciousBurst = !!(comp != null && inSuspiciousSet);
      const status: 'done' | 'pending' | 'suspicious' =
        comp != null && isValidCompletion && !isSuspiciousBurst
          ? 'done'
          : comp != null && isSuspiciousBurst
            ? 'suspicious'
            : 'pending';
      const overdue = dateStrItem < dateStr;
      const row: TaskMonitorRow = {
        taskId: task.id,
        title: task.name,
        type,
        dueDate: dateStrItem,
        assignedTo: a.assignedName ?? null,
        assignedEmpId: a.assignedEmpId,
        status: status === 'suspicious' ? 'pending' : status,
        completedAt: comp ? comp.completedAt.toISOString() : null,
        overdue,
        isValidCompletion,
        isSuspiciousBurst,
      };
      if (comp) {
        row.completionDelay = formatDelay(comp.completedAt, dateStrItem);
      } else if (overdue) {
        const due = new Date(dateStrItem + 'T00:00:00Z');
        row.overdueByDays = Math.floor((new Date(dateStr + 'T00:00:00Z').getTime() - due.getTime()) / 86400000);
      }
      if (typeFilter !== 'all' && type !== typeFilter) continue;
      if (assigneeFilter !== 'all' && a.assignedEmpId !== assigneeFilter) continue;
      if (a.assignedEmpId && !operationalEmpIds.has(a.assignedEmpId)) continue;
      if (search && !task.name.toLowerCase().includes(search)) continue;
      if (statusFilter === 'completed' && status !== 'done') continue;
      if (statusFilter === 'pending' && status !== 'pending') continue;
      if (statusFilter === 'overdue' && (status !== 'pending' || !overdue)) continue;
      if (onlySuspicious && status !== 'suspicious') continue;
      rows.push(row);
    }
  }

  const completedRows = rows.filter((r) => r.status === 'done');
  const pendingRows = rows.filter((r) => r.status === 'pending' && !r.isSuspiciousBurst);
  const suspiciousCount = rows.filter((r) => r.isSuspiciousBurst).length;
  completedRows.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  pendingRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const empStats = new Map<
    string,
    { name: string; assigned: number; completed: number; pending: number; overdue: number; delaySum: number; delayCount: number; onTimeCount: number }
  >();
  for (const r of rows) {
    const eid = r.assignedEmpId ?? '__unassigned__';
    const name = r.assignedTo ?? '—';
    if (!empStats.has(eid)) {
      empStats.set(eid, { name, assigned: 0, completed: 0, pending: 0, overdue: 0, delaySum: 0, delayCount: 0, onTimeCount: 0 });
    }
    const s = empStats.get(eid)!;
    s.assigned++;
    if (r.status === 'done') {
      s.completed++;
      if (r.completionDelay) {
        s.delayCount++;
        const mins = r.completionDelay.minutes ?? 0;
        s.delaySum += mins;
        if (r.completionDelay.kind !== 'late') s.onTimeCount++;
      }
    } else {
      s.pending++;
      if (r.overdue) s.overdue++;
    }
  }
  const employeeStats: EmployeeStatRow[] = [];
  for (const [eid, s] of Array.from(empStats.entries())) {
    if (eid === '__unassigned__') continue;
    const completionRate = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
    const onTimeRate = s.completed > 0 ? Math.round((s.onTimeCount / s.completed) * 100) : 100;
    const avgDelayMinutes = s.delayCount > 0 ? Math.round(s.delaySum / s.delayCount) : null;
    employeeStats.push({
      empId: eid,
      name: s.name,
      assigned: s.assigned,
      completed: s.completed,
      pending: s.pending,
      overdue: s.overdue,
      completionRate,
      onTimeRate,
      avgDelayMinutes: avgDelayMinutes ?? 0, // 0 when no completed with delay
    });
  }
  employeeStats.sort((a: EmployeeStatRow, b: EmployeeStatRow) => {
    if (b.overdue !== a.overdue) return b.overdue - a.overdue;
    return a.completionRate - b.completionRate;
  });

  return NextResponse.json({
    dateStr,
    employees: employees.map((e) => ({ empId: e.empId, name: e.name })),
    summary: {
      completed: completedRows.length,
      pending: pendingRows.length,
      overdue: pendingRows.filter((r) => r.overdue).length,
      suspicious: suspiciousCount,
    },
    completedTasks: completedRows,
    pendingTasks: pendingRows,
    employeeStats,
    suspiciousBursts,
  });
}
