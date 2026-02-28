/**
 * تحقق من وجود بيانات المهام والإجازات في قاعدة البيانات.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/check-db-counts.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [taskCount, leaveCount, taskPlanCount, taskScheduleCount] = await Promise.all([
    prisma.task.count({ where: { active: true } }),
    prisma.leave.count(),
    prisma.taskPlan.count(),
    prisma.taskSchedule.count(),
  ]);

  console.log('--- Database counts (المهام والإجازات) ---');
  console.log('Task (active):     ', taskCount);
  console.log('Leave:             ', leaveCount);
  console.log('TaskPlan:         ', taskPlanCount);
  console.log('TaskSchedule:     ', taskScheduleCount);
  console.log('----------------------------------------');
  if (taskCount === 0) console.log('→ No active tasks. Add tasks in Task Setup and assign TaskPlan (primary/backup).');
  if (leaveCount === 0) console.log('→ No leaves. Add leaves from the Leaves page.');
  if (taskPlanCount === 0 && taskCount > 0) console.log('→ Tasks exist but no TaskPlan. Assign primary/backup in Task Setup.');
  if (taskScheduleCount === 0 && taskCount > 0) console.log('→ Tasks exist but no TaskSchedule. Add schedule (e.g. DAILY) in Task Setup.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
