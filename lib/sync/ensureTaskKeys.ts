import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { tasksRunnableOnDate } from '@/lib/services/tasks';
import { getWeekIndexInYear } from '@/lib/services/shift';
import {
  getTypeCode,
  getZoneFromTaskName,
  buildTaskKey,
  getQuarter,
} from './taskKey';

type TaskWithRelations = Awaited<
  ReturnType<PrismaClient['task']['findMany']>
>[number] & {
  taskSchedules: Awaited<ReturnType<PrismaClient['taskSchedule']['findMany']>>;
  taskPlans: Awaited<ReturnType<PrismaClient['taskPlan']['findMany']>>;
};

/**
 * Shared scope: tasks that belong to the approved week (same set used by export/sync).
 * Active tasks that run on at least one day in the week (Sat–Fri).
 * Reuse this for backfill and validation so scope matches export exactly.
 */
export async function getTasksInScopeForWeek(
  client: Pick<PrismaClient, 'task'>,
  weekStart: string
): Promise<TaskWithRelations[]> {
  const start = new Date(weekStart + 'T00:00:00Z');
  const tasks = await client.task.findMany({
    where: { active: true },
    include: { taskSchedules: true, taskPlans: true },
  });
  return tasks.filter((task) => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      if (tasksRunnableOnDate(task, d)) return true;
    }
    return false;
  });
}

export type EnsureTaskKeysResult = {
  backfilled: number;
  totalInScope: number;
  remainingNull: number;
};

/**
 * Backfill taskKey for the approved week inside a transaction.
 * Uses same scope as export/sync. Idempotent: does not overwrite existing taskKeys.
 * After backfill, validates that no task in scope has taskKey null; throws if any remain.
 */
export async function ensureTaskKeysForApprovedWeekWithTx(
  tx: Pick<PrismaClient, 'task'>,
  weekStart: string
): Promise<EnsureTaskKeysResult> {
  const start = new Date(weekStart + 'T00:00:00Z');
  const year = start.getUTCFullYear();
  const weekNum = getWeekIndexInYear(start) + 1;
  const quarter = getQuarter(year, start.getUTCMonth() + 1);

  const tasksInWeek = await getTasksInScopeForWeek(tx, weekStart);
  const totalInScope = tasksInWeek.length;

  const withoutKey = tasksInWeek
    .filter((t) => !t.taskKey)
    .sort((a, b) => a.id.localeCompare(b.id));

  let seq = 1;
  for (const task of withoutKey) {
    const type = task.taskSchedules[0]?.type ?? 'WEEKLY';
    const typeCode = getTypeCode(type);
    const zone = getZoneFromTaskName(task.name);
    const key = buildTaskKey(year, quarter, weekNum, typeCode, zone, seq);
    await tx.task.update({ where: { id: task.id }, data: { taskKey: key } });
    seq++;
  }

  const taskIds = tasksInWeek.map((t) => t.id);
  const remainingNull = await tx.task.count({
    where: { id: { in: taskIds }, taskKey: null },
  });

  if (remainingNull > 0) {
    throw new Error(
      `Approve Week taskKey backfill: ${remainingNull} task(s) in scope still have taskKey=null (weekStart=${weekStart})`
    );
  }

  return {
    backfilled: withoutKey.length,
    totalInScope,
    remainingNull: 0,
  };
}

/**
 * When a week is approved, ensure every task that runs in that week has a taskKey.
 * Uses the same Saturday-based week logic as the Schedule module.
 * Idempotent: existing taskKeys are not changed.
 * Delegates to ensureTaskKeysForApprovedWeekWithTx(prisma, weekStart).
 */
export async function ensureTaskKeysForApprovedWeek(weekStart: string): Promise<number> {
  const result = await ensureTaskKeysForApprovedWeekWithTx(prisma, weekStart);
  return result.backfilled;
}
