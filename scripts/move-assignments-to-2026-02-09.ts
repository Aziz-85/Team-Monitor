/**
 * One-off: Move effective date of 7036 and 9034 Team B assignments to 2026-02-09.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/move-assignments-to-2026-02-09.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_DATE = new Date('2026-02-09T00:00:00Z');
const EMP_IDS = ['7036', '9034'];

async function main() {
  for (const empId of EMP_IDS) {
    const latest = await prisma.employeeTeamAssignment.findFirst({
      where: { empId, team: 'B' },
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true, effectiveFrom: true },
    });
    if (!latest) {
      console.log(`No Team B assignment found for ${empId}, skipping.`);
      continue;
    }
    await prisma.employeeTeamAssignment.update({
      where: { id: latest.id },
      data: { effectiveFrom: TARGET_DATE },
    });
    console.log(`Updated ${empId}: effectiveFrom → 2026-02-09`);
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
