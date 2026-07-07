#!/usr/bin/env ts-node
/**
 * Grant or revoke platform-owner dual-mode capability.
 *
 * Usage (run after `npx prisma generate` if the client is stale):
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/set-platform-owner.ts admin_rashid
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/set-platform-owner.ts admin_rashid --remove
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const empId = process.argv[2]?.trim();
  const remove = process.argv.includes('--remove');
  if (!empId) {
    console.error('Usage: set-platform-owner.ts <empId> [--remove]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { empId },
    select: { id: true, empId: true, role: true, boutiqueId: true, isPlatformOwner: true },
  });
  if (!user) {
    console.error(`User not found: ${empId}`);
    process.exit(1);
  }
  if (!user.boutiqueId) {
    console.error(`User ${empId} has no boutiqueId. Assign a primary boutique first.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isPlatformOwner: !remove },
  });

  if (remove) {
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { activeMode: 'BRANCH_MANAGER', platformModeLastActiveAt: null },
    });
    console.log(`Removed platform owner flag from ${empId} (role remains ${user.role}).`);
  } else {
    console.log(`Set ${empId} as platform owner (role remains ${user.role}, boutique ${user.boutiqueId}).`);
    console.log('Daily login defaults to Branch Manager mode. Use Admin Mode switch for elevation.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
