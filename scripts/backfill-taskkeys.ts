/**
 * SAFE backfill for missing taskKey values.
 * - Only fills tasks where taskKey is NULL.
 * - Does not modify any existing taskKey or DB structure.
 * - Idempotent.
 */

// Register path aliases before loading libs that use @/
const path = require('path') as typeof import('path');
const { register } = require('tsconfig-paths') as { register: (config: { baseUrl: string; paths: Record<string, string[]> }) => void };
register({ baseUrl: path.join(__dirname, '..'), paths: { '@/*': ['./*'] } });

import { prisma } from '../lib/db';
import { ensureTaskKeysForApprovedWeek } from '../lib/sync/ensureTaskKeys';
import { tasksRunnableOnDate } from '../lib/services/tasks';

function taskRunsInWeek(
  task: { taskSchedules: { type: string; weeklyDays: number[]; monthlyDay: number | null; isLastDay: boolean }[] },
  weekStart: string
): boolean {
  const start = new Date(weekStart + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (tasksRunnableOnDate(task as Parameters<typeof tasksRunnableOnDate>[0], d)) return true;
  }
  return false;
}

async function main(): Promise<void> {
  const approvedWeeks = await prisma.scheduleWeekStatus.findMany({
    select: { weekStart: true },
  });

  const tasksWithoutKey = await prisma.task.findMany({
    where: { taskKey: null, active: true },
    include: { taskSchedules: true },
  });

  const weekStartsWithMissingKeys: string[] = [];
  for (const { weekStart } of approvedWeeks) {
    const hasMissing = tasksWithoutKey.some((task) => taskRunsInWeek(task, weekStart));
    if (hasMissing) weekStartsWithMissingKeys.push(weekStart);
  }

  if (weekStartsWithMissingKeys.length === 0) {
    console.log('No missing taskKeys.');
    return;
  }

  for (const weekStart of weekStartsWithMissingKeys) {
    const fixed = await ensureTaskKeysForApprovedWeek(weekStart);
    console.log(`Week ${weekStart}: ${fixed} task(s) fixed.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
