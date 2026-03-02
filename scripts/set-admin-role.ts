/**
 * One-off: Set a user's role to ADMIN by employee ID (empId).
 * Use for giving admin to AlRashid manager or any employee (e.g. 1205).
 *
 * Run (from project root):
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/set-admin-role.ts 1205
 * Or for AlRashid manager's empId if different:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/set-admin-role.ts <empId>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const empId = process.argv[2]?.trim();
  if (!empId) {
    console.error('Usage: npx ts-node --compiler-options \'{"module":"CommonJS"}\' scripts/set-admin-role.ts <empId>');
    console.error('Example: scripts/set-admin-role.ts 1205');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { empId },
    select: {
      id: true,
      empId: true,
      role: true,
      employee: { select: { name: true } },
      boutique: { select: { code: true, name: true } },
    },
  });

  if (!user) {
    console.error(`User with empId "${empId}" not found.`);
    process.exit(1);
  }

  if ((user.role as string) === 'SUPER_ADMIN') {
    console.error('Cannot change SUPER_ADMIN role.');
    process.exit(1);
  }

  if ((user.role as string) === 'ADMIN') {
    console.log(`User ${user.empId} (${user.employee?.name ?? '—'}) is already ADMIN. No change.`);
    process.exit(0);
  }

  await prisma.user.update({
    where: { empId },
    data: { role: 'ADMIN' },
  });

  console.log(`Done. User ${user.empId} (${user.employee?.name ?? '—'}) role set to ADMIN.`);
  console.log(`Boutique: ${user.boutique?.name ?? '—'} (${user.boutique?.code ?? '—'}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
