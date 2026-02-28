import { prisma } from '@/lib/db';
import type { CompareRow } from './comparePlanner';
import type { SiteTaskOccurrence } from './siteState';

/**
 * Apply Planner completions to Site: create TaskCompletion and update Task metadata.
 * Only applies rows where plannerStatus === DONE and siteStatus !== DONE and taskKey matched.
 */
export async function applyPlannerCompletions(
  applyCandidates: CompareRow[],
  siteState: SiteTaskOccurrence[]
): Promise<{ applied: number; skipped: number }> {
  const siteByKeyDue = new Map<string, SiteTaskOccurrence>();
  for (const s of siteState) {
    siteByKeyDue.set(`${s.taskKey}\t${s.dueDate}`, s);
  }
  const usersByEmpId = await prisma.user.findMany({
    select: { id: true, empId: true },
  });
  const userIdByEmpId = Object.fromEntries(usersByEmpId.map((u) => [u.empId, u.id]));
  let applied = 0;
  let skipped = 0;
  const now = new Date();

  for (const row of applyCandidates) {
    if (row.plannerStatus !== 'DONE' || row.siteStatus === 'DONE' || !row.taskKey || !row.dueDate) {
      skipped++;
      continue;
    }
    const dueNorm = row.dueDate.slice(0, 10);
    const site = siteByKeyDue.get(`${row.taskKey}\t${dueNorm}`);
    if (!site || !site.assigneeEmpId) {
      skipped++;
      continue;
    }
    const userId = userIdByEmpId[site.assigneeEmpId];
    if (!userId) {
      skipped++;
      continue;
    }
    const existing = await prisma.taskCompletion.findUnique({
      where: { taskId_userId: { taskId: site.taskId, userId } },
    });
    if (existing && !existing.undoneAt) {
      skipped++;
      continue;
    }
    await prisma.taskCompletion.upsert({
      where: { taskId_userId: { taskId: site.taskId, userId } },
      create: {
        taskId: site.taskId,
        userId,
        completedAt: now,
      },
      update: { completedAt: now, undoneAt: null },
    });
    await prisma.task.update({
      where: { id: site.taskId },
      data: {
        completionSource: 'PLANNER_IMPORT',
        importedCompletionAt: now,
      },
    });
    applied++;
  }

  return { applied, skipped };
}
