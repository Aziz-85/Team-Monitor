/**
 * Boutique Performance Score — aggregation only, no schema changes.
 * Weights: Revenue 40%, Tasks 25%, Schedule 15%, Zone 10%, Discipline 10%.
 */

import { prisma } from '@/lib/db';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { rosterForDate } from '@/lib/services/roster';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';

const BURST_WINDOW_MS = 3 * 60 * 1000;
const BURST_MIN_TASKS = 4;

export type BoutiqueScoreClassification =
  | 'Elite'
  | 'Strong'
  | 'Good'
  | 'Fair'
  | 'Needs Improvement';

export type BoutiqueScoreResult = {
  score: number;
  classification: BoutiqueScoreClassification;
  components?: {
    revenue: number;
    tasks: number;
    schedule: number;
    zone: number;
    discipline: number;
  };
};

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

function classificationFromScore(score: number): BoutiqueScoreClassification {
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Good';
  if (score >= 45) return 'Fair';
  return 'Needs Improvement';
}

/**
 * Calculate boutique performance score for a month.
 * Uses one representative week (mid-month) for tasks, schedule, zone, discipline.
 * When boutiqueIds is provided, only those boutiques are included (multi-tenant).
 */
export async function calculateBoutiqueScore(
  monthKey: string,
  boutiqueIds?: string[]
): Promise<BoutiqueScoreResult> {
  const [y, m] = monthKey.split('-').map(Number);
  const midDate = new Date(Date.UTC(y, m - 1, 15, 12, 0, 0, 0));
  const weekStart = getWeekStart(midDate);
  const weekDates = getWeekDates(weekStart);
  const rangeStart = new Date(weekDates[0] + 'T00:00:00Z');
  const rangeEnd = new Date(weekDates[6] + 'T23:59:59.999Z');

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
    rosterMid,
    allUsers,
  ] = await Promise.all([
    boutiqueFilter
      ? prisma.boutiqueMonthlyTarget.findFirst({
          where: { month: monthKey, ...boutiqueFilter },
        })
      : prisma.boutiqueMonthlyTarget.findFirst({ where: { month: monthKey } }),
    prisma.salesEntry.aggregate({
      where: { month: monthKey, ...(boutiqueFilter ?? {}) },
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
          select: { status: true, completedAt: true },
        })
      : prisma.inventoryWeeklyZoneRun.findMany({
          where: { weekStart: new Date(weekStart + 'T00:00:00Z') },
          select: { status: true, completedAt: true },
        }),
    rosterForDate(midDate),
    prisma.user.findMany({ where: { disabled: false }, select: { id: true, empId: true } }),
  ]);

  const empIdToUserId = new Map(allUsers.map((u) => [u.empId, u.id]));
  const revenue = salesSum._sum.amount ?? 0;
  const target = boutiqueTarget?.amount ?? 0;
  const revenuePct = target > 0 ? Math.min(100, Math.round((revenue / target) * 100)) : 0;
  const revenueScore = (revenuePct / 100) * 40;

  let totalWeekly = 0;
  let completed = 0;
  for (const dateStr of weekDates) {
    const date = new Date(dateStr + 'T00:00:00Z');
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
    }
  }
  const taskPct = totalWeekly > 0 ? Math.min(100, Math.round((completed / totalWeekly) * 100)) : 100;
  const tasksScore = (taskPct / 100) * 25;

  const amCount = rosterMid.amEmployees.length;
  const pmCount = rosterMid.pmEmployees.length;
  const schedulePct =
    Math.max(amCount, pmCount) > 0
      ? Math.round((Math.min(amCount, pmCount) / Math.max(amCount, pmCount)) * 100)
      : 100;
  const scheduleScore = (schedulePct / 100) * 15;

  const zoneTotal = zoneRuns.length;
  const zoneDone = zoneRuns.filter(
    (r) => r.status === 'COMPLETED' || r.completedAt != null
  ).length;
  const zonePct = zoneTotal > 0 ? Math.round((zoneDone / zoneTotal) * 100) : 100;
  const zoneScore = (zonePct / 100) * 10;

  const burstCount = countBursts(
    completionsInWeek.map((c) => ({ userId: c.userId, completedAt: c.completedAt }))
  );
  const disciplinePct = Math.max(0, 100 - Math.min(100, burstCount * 8));
  const disciplineScore = (disciplinePct / 100) * 10;

  const score = Math.round(
    revenueScore + tasksScore + scheduleScore + zoneScore + disciplineScore
  );
  const classification = classificationFromScore(score);

  return {
    score,
    classification,
    components: {
      revenue: Math.round(revenueScore),
      tasks: Math.round(tasksScore),
      schedule: Math.round(scheduleScore),
      zone: Math.round(zoneScore),
      discipline: Math.round(disciplineScore),
    },
  };
}
