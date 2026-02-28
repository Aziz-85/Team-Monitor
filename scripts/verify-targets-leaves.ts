/**
 * For a monthKey, prints each employee: empId, role, scheduledDays, leaveDays, presenceFactor, target.
 * Verifies sum(targets) === boutique target.
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' -r tsconfig-paths/register scripts/verify-targets-leaves.ts [monthKey]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const monthKey = process.argv[2] || '2026-02';

async function main() {
  const boutique = await prisma.boutiqueMonthlyTarget.findFirst({ where: { month: monthKey } });
  if (!boutique) {
    console.log('No boutique target for', monthKey);
    process.exit(1);
  }
  const targets = await prisma.employeeMonthlyTarget.findMany({
      where: { month: monthKey, boutiqueId: boutique.boutiqueId },
      include: {
        user: { select: { empId: true }, include: { employee: { select: { name: true } } } },
      },
    });

  console.log('Month:', monthKey);
  console.log('Boutique:', boutique.boutiqueId);
  console.log('Boutique target (SAR):', boutique.amount);
  console.log('');
  console.log('empId\trole\tscheduled\tleave\tpresence%\teffWeight\ttarget');

  let sum = 0;
  for (const et of targets) {
    const role = et.roleAtGeneration ?? '—';
    const scheduled = et.scheduledDaysInMonth ?? '—';
    const leave = et.leaveDaysInMonth ?? '—';
    const presence = et.presenceFactor != null ? (et.presenceFactor * 100).toFixed(1) + '%' : '—';
    const eff = et.effectiveWeightAtGeneration ?? '—';
    sum += et.amount;
    console.log(
      `${et.user.empId}\t${role}\t${scheduled}\t${leave}\t${presence}\t${eff}\t${et.amount}`
    );
  }

  console.log('');
  console.log('Sum of employee targets:', sum);
  console.log('Boutique target:        ', boutique.amount);
  console.log('Match:', sum === boutique.amount ? 'YES' : 'NO (diff=' + (boutique.amount - sum) + ')');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
