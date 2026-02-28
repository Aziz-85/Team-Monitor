/**
 * List employees by boutique (Dhahran vs AlRashid).
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/list-employees-by-boutique.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const boutiques = await prisma.boutique.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });

  for (const b of boutiques) {
    const employees = await prisma.employee.findMany({
      where: { boutiqueId: b.id, active: true },
      orderBy: [{ name: 'asc' }],
      select: {
        empId: true,
        name: true,
        position: true,
        team: true,
        isSystemOnly: true,
        user: { select: { role: true } },
      },
    });
    const label = `${b.name} (${b.code})`;
    console.log('\n' + '='.repeat(60));
    console.log('  ' + label);
    console.log('='.repeat(60));
    if (employees.length === 0) {
      console.log('  (لا موظفين)');
      continue;
    }
    for (const e of employees) {
      const role = e.user?.role ?? '—';
      const sys = e.isSystemOnly ? ' [نظام]' : '';
      const pos = e.position ?? '—';
      console.log(`  ${e.empId.padEnd(20)} ${e.name.padEnd(28)} ${String(pos).padEnd(18)} فريق ${e.team}   دور: ${role}${sys}`);
    }
    console.log(`  المجموع: ${employees.length}`);
  }
  console.log('\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
