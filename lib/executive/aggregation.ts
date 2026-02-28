/**
 * Executive aggregation — server-side data fetch for one week.
 * Uses existing Prisma models. No schema changes. Asia/Riyadh, Saturday week.
 */

import { prisma } from '@/lib/db';
import { rosterForDate } from '@/lib/services/roster';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';

const BURST_WINDOW_MS = 3 * 60 * 1000;
const BURST_MIN_TASKS = 4;

function getWeekDates(weekStart: string): string[] {
  const d = new Date(weekStart + 'T12:00:00Z');
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

function countBursts(completions: { userId: string; completedAt: Date }[]): number {
  const byUser = new Map<string, { completedAt: Date }[]>();
  for (const c of completions) {
    let list = byUser.get(c.userId);
    if (!list) {
      list = [];
      byUser.set(c.userId, list);
    }
    list.push({ completedAt: c.completedAt });
  }
  let total = 0;
  for (const [, list] of Array.from(byUser.entries())) {
    list.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    for (let i = 0; i < list.length; i++) {
      const t0 = list[i].completedAt.getTime();
      const inWindow = list.filter(
        (t) =>
          t.completedAt.getTime() >= t0 &&
          t.completedAt.getTime() <= t0 + BURST_WINDOW_MS
      );
      if (inWindow.length >= BURST_MIN_TASKS) total++;
    }
  }
  return total;
}

export type WeekMetricsRaw = {
  weekStart: string;
  weekEnd: string;
  revenue: number;
  target: number;
  taskTotal: number;
  taskCompleted: number;
  taskOverdue: number;
  zoneTotal: number;
  zoneCompleted: number;
  amCount: number;
  pmCount: number;
  burstCount: number;
  topPerformers: { userId: string; name: string; count: number }[];
  zoneByCode: { zone: string; rate: number }[];
};

/**
 * Fetch raw metrics for one week. Uses aggregate queries + one task loop per week.
 * When boutiqueIds is provided, only those boutiques are included (multi-tenant).
 */
export async function fetchWeekMetrics(
  weekStart: string,
  todayStr: string,
  boutiqueIds?: string[]
): Promise<WeekMetricsRaw> {
  const weekDates = getWeekDates(weekStart);
  const rangeStart = new Date(weekDates[0] + 'T00:00:00Z');
  const rangeEnd = new Date(weekDates[6] + 'T23:59:59.999Z');
  const monthKey = weekStart.slice(0, 7);

  const boutiqueFilter =
    boutiqueIds && boutiqueIds.length > 0
      ? { boutiqueId: { in: boutiqueIds } }
      : undefined;
  const zoneIdsForFilter =
    boutiqueIds && boutiqueIds.length > 0
      ? (
          await prisma.inventoryZone.findMany({
            where: { boutiqueId: { in: boutiqueIds } },
            select: { id: true },
          })
        ).map((z) => z.id)
      : null;

  const [
    boutiqueTarget,
    salesSum,
    tasks,
    completionsInWeek,
    zoneRuns,
    allUsers,
    rosterMid,
  ] = await Promise.all([
    boutiqueFilter
      ? prisma.boutiqueMonthlyTarget.findFirst({
          where: { month: monthKey, ...boutiqueFilter },
        })
      : prisma.boutiqueMonthlyTarget.findFirst({ where: { month: monthKey } }),
    prisma.salesEntry.aggregate({
      where: {
        date: {
          gte: new Date(weekDates[0] + 'T00:00:00Z'),
          lte: new Date(weekDates[6] + 'T00:00:00Z'),
        },
        ...(boutiqueFilter ?? {}),
      },
      _sum: { amount: true },
    }),
    prisma.task.findMany({
      where: { active: true, ...(boutiqueFilter ?? {}) },
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
    }),
    prisma.taskCompletion.findMany({
      where: {
        undoneAt: null,
        completedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { taskId: true, userId: true, completedAt: true },
    }),
    zoneIdsForFilter && zoneIdsForFilter.length > 0
      ? prisma.inventoryWeeklyZoneRun.findMany({
          where: {
            weekStart: new Date(weekStart + 'T00:00:00Z'),
            zoneId: { in: zoneIdsForFilter },
          },
          select: { zoneId: true, status: true, completedAt: true },
        })
      : prisma.inventoryWeeklyZoneRun.findMany({
          where: { weekStart: new Date(weekStart + 'T00:00:00Z') },
          select: { zoneId: true, status: true, completedAt: true },
        }),
    prisma.user.findMany({
      where: { disabled: false },
      select: { id: true, empId: true, employee: { select: { name: true } } },
    }),
    rosterForDate(new Date(weekDates[3] + 'T12:00:00Z')),
  ]);

  const empIdToUserId = new Map(allUsers.map((u) => [u.empId, u.id]));
  const userIdToName = new Map(
    allUsers.map((u) => [u.id, u.employee?.name ?? u.empId])
  );

  let totalWeekly = 0;
  let completed = 0;
  let overdue = 0;
  for (const dateStr of weekDates) {
    const date = new Date(dateStr + 'T00:00:00Z');
    const isPast = dateStr < todayStr;
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      totalWeekly++;
      const assignedUserId = a.assignedEmpId ? empIdToUserId.get(a.assignedEmpId) : null;
      const comp = completionsInWeek.find(
        (c) =>
          c.taskId === task.id &&
          (assignedUserId ? c.userId === assignedUserId : false)
      );
      if (comp) completed++;
      else if (isPast) overdue++;
    }
  }

  const revenue = salesSum._sum.amount ?? 0;
  const target = boutiqueTarget?.amount ?? 0;
  const burstCount = countBursts(
    completionsInWeek.map((c) => ({ userId: c.userId, completedAt: c.completedAt }))
  );

  const byUser = new Map<string, number>();
  for (const c of completionsInWeek) {
    byUser.set(c.userId, (byUser.get(c.userId) ?? 0) + 1);
  }
  const topPerformers = Array.from(byUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, count]) => ({
      userId,
      name: userIdToName.get(userId) ?? userId,
      count,
    }));

  const zoneIds = zoneRuns.map((z) => z.zoneId).filter((id, i, arr) => arr.indexOf(id) === i);
  const zones =
    zoneIds.length > 0
      ? await prisma.inventoryZone.findMany({
          where: { id: { in: zoneIds } },
          select: { id: true, code: true },
        })
      : [];
  const zoneCodeById = new Map(zones.map((z) => [z.id, z.code]));
  const zoneByCode = new Map<string, { done: number; total: number }>();
  for (const r of zoneRuns) {
    const code = zoneCodeById.get(r.zoneId) ?? r.zoneId;
    if (!zoneByCode.has(code)) zoneByCode.set(code, { done: 0, total: 0 });
    const z = zoneByCode.get(code)!;
    z.total++;
    if (r.status === 'COMPLETED' || r.completedAt != null) z.done++;
  }
  const zoneByCodeList = Array.from(zoneByCode.entries())
    .map(([zone, v]) => ({
      zone,
      rate: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
    }))
    .sort((a, b) => a.zone.localeCompare(b.zone));

  return {
    weekStart,
    weekEnd: weekDates[6],
    revenue,
    target,
    taskTotal: totalWeekly,
    taskCompleted: completed,
    taskOverdue: overdue,
    zoneTotal: zoneRuns.length,
    zoneCompleted: zoneRuns.filter((r) => r.status === 'COMPLETED' || r.completedAt != null).length,
    amCount: rosterMid.amEmployees.length,
    pmCount: rosterMid.pmEmployees.length,
    burstCount,
    topPerformers,
    zoneByCode: zoneByCodeList,
  };
}

export type DailyRevenueRow = { dateStr: string; amount: number };

/**
 * Fetch daily revenue for one week. Returns 7 rows (Sat–Fri); missing days have amount 0.
 * When boutiqueIds is provided, only those boutiques are included.
 */
export async function fetchDailyRevenueForWeek(
  weekStart: string,
  boutiqueIds?: string[]
): Promise<DailyRevenueRow[]> {
  const weekDates = getWeekDates(weekStart);
  const rangeStart = new Date(weekDates[0] + 'T00:00:00Z');
  const rangeEnd = new Date(weekDates[6] + 'T00:00:00Z');
  const boutiqueFilter =
    boutiqueIds && boutiqueIds.length > 0
      ? { boutiqueId: { in: boutiqueIds } }
      : undefined;

  const rows = await prisma.salesEntry.groupBy({
    by: ['date'],
    where: {
      date: { gte: rangeStart, lte: rangeEnd },
      ...(boutiqueFilter ?? {}),
    },
    _sum: { amount: true },
  });

  const byDate = new Map(
    rows.map((r) => [r.date.toISOString().slice(0, 10), r._sum.amount ?? 0])
  );
  return weekDates.map((dateStr) => ({
    dateStr,
    amount: byDate.get(dateStr) ?? 0,
  }));
}
