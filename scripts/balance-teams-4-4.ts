/**
 * One-off: Balance teams to 4-4 by moving 7036 and 9034 from Team A → Team B.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/balance-teams-4-4.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getNextSaturday(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const daysUntilSaturday = (6 - day + 7) % 7;
  const nextSat = new Date(d);
  nextSat.setUTCDate(d.getUTCDate() + (daysUntilSaturday === 0 ? 7 : daysUntilSaturday));
  return nextSat;
}

async function main() {
  const effectiveFrom = getNextSaturday(new Date());
  const effectiveFromStr = effectiveFrom.toISOString().slice(0, 10);

  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  });
  if (!adminUser) {
    throw new Error('No ADMIN user found. Create an admin user first.');
  }

  const empIds = ['7036', '9034'];
  for (const empId of empIds) {
    const existing = await prisma.employeeTeamAssignment.findFirst({
      where: { empId },
      orderBy: { effectiveFrom: 'desc' },
      select: { effectiveFrom: true, team: true },
    });
    if (existing && existing.team === 'B') {
      console.log(`Emp ${empId} already has latest assignment to B, skipping.`);
      continue;
    }
    await prisma.employeeTeamAssignment.create({
      data: {
        empId,
        team: 'B',
        effectiveFrom,
        reason: 'Balance teams to 4-4 (immediate)',
        createdByUserId: adminUser.id,
      },
    });
    console.log(`Created assignment: ${empId} → Team B effective ${effectiveFromStr}`);
  }

  console.log('Done. Verify at /admin/employees and Schedule (View) for next week.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
