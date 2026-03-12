/**
 * Boutique Performance Score — aggregation only, no schema changes.
 * Weights: Revenue 40%, Tasks 25%, Schedule 15%, Zone 10%, Discipline 10%.
 *
 * Uses the FULL MONTH for task completions, zone runs, and anti-gaming.
 * Schedule balance uses a mid-month sample day (roster is weekly-stable).
 */

import { prisma } from '@/lib/db';
import { whereBoutiqueStrict } from '@/lib/scope/whereStrict';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
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
  burstCount: number;
  rosterSize: number;
};

function getMonthDates(y: number, m: number): string[] {
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    out.push(`${y}-${mm}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

export function countBursts(completions: { userId: string; completedAt: Date }[]): number {
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
 * Calculate boutique performance score for a FULL MONTH.
 * boutiqueIds required — filter at source.
 */
export async function calculateBoutiqueScore(
  monthKey: string,
  boutiqueIds: string[]
): Promise<BoutiqueScoreResult> {
  const boutiqueFilter = whereBoutiqueStrict(boutiqueIds);
  const [y, m] = monthKey.split('-').map(Number);

  const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const monthEndExclusive = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const allDates = getMonthDates(y, m);
  const midDate = new Date(Date.UTC(y, m - 1, 15, 12, 0, 0, 0));

  const zoneIdsForFilter = (
    await prisma.inventoryZone.findMany({
      where: boutiqueFilter,
      select: { id: true },
    })
  ).map((z) => z.id);

  const [
    boutiqueTarget,
    salesSum,
    tasks,
    completionsInMonth,
    zoneRuns,
    rosterMid,
    allUsers,
  ] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { month: monthKey, ...boutiqueFilter },
    }),
    // Authoritative revenue from Daily Sales Ledger (BoutiqueSalesSummary)
    prisma.boutiqueSalesSummary.aggregate({
      where: { ...boutiqueFilter, date: { gte: monthStart, lt: monthEndExclusive } },
      _sum: { totalSar: true },
    }),
    prisma.task.findMany({
      where: { active: true, ...boutiqueFilter },
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
        completedAt: { gte: monthStart, lt: monthEndExclusive },
        task: boutiqueFilter,
      },
      select: { taskId: true, userId: true, completedAt: true },
    }),
    zoneIdsForFilter.length > 0
      ? prisma.inventoryWeeklyZoneRun.findMany({
          where: {
            weekStart: { gte: monthStart, lt: monthEndExclusive },
            zoneId: { in: zoneIdsForFilter },
          },
          select: { status: true, completedAt: true },
        })
      : Promise.resolve([]),
    rosterForDate(midDate, { boutiqueIds }),
    prisma.user.findMany({ where: { disabled: false }, select: { id: true, empId: true } }),
  ]);

  const empIdToUserId = new Map(allUsers.map((u) => [u.empId, u.id]));

  // Revenue (40%) — from authoritative ledger
  const revenue = salesSum._sum.totalSar ?? 0;
  const target = boutiqueTarget?.amount ?? 0;
  const revenuePct = calculatePerformance({ target, sales: revenue }).percent;
  const revenueScore = (revenuePct / 100) * 40;

  // Tasks (25%) — full month
  let totalExpected = 0;
  let totalCompleted = 0;
  for (const dateStr of allDates) {
    const date = new Date(dateStr + 'T00:00:00Z');
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      totalExpected++;
      const assignedUserId = a.assignedEmpId ? empIdToUserId.get(a.assignedEmpId) : null;
      const comp = completionsInMonth.find(
        (c) =>
          c.taskId === task.id &&
          (assignedUserId ? c.userId === assignedUserId : false)
      );
      if (comp) totalCompleted++;
    }
  }
  const taskPct = totalExpected > 0 ? Math.min(100, Math.round((totalCompleted / totalExpected) * 100)) : 100;
  const tasksScore = (taskPct / 100) * 25;

  // Schedule balance (15%) — mid-month sample
  const amCount = rosterMid.amEmployees.length;
  const pmCount = rosterMid.pmEmployees.length;
  const rosterSize = amCount + pmCount;
  const schedulePct =
    Math.max(amCount, pmCount) > 0
      ? Math.round((Math.min(amCount, pmCount) / Math.max(amCount, pmCount)) * 100)
      : 100;
  const scheduleScore = (schedulePct / 100) * 15;

  // Zone compliance (10%) — full month
  const zoneTotal = zoneRuns.length;
  const zoneDone = zoneRuns.filter(
    (r) => r.status === 'COMPLETED' || r.completedAt != null
  ).length;
  const zonePct = zoneTotal > 0 ? Math.round((zoneDone / zoneTotal) * 100) : 100;
  const zoneScore = (zonePct / 100) * 10;

  // Discipline / anti-gaming (10%) — full month
  const burstCount = countBursts(
    completionsInMonth.map((c) => ({ userId: c.userId, completedAt: c.completedAt }))
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
    burstCount,
    rosterSize,
  };
}
