/**
 * Disable the duplicate AlRashid boutique with code "02" (0 members).
 * Keeps only AlRashid S02. Run once: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/disable-duplicate-boutique-02.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const duplicate = await prisma.boutique.findFirst({
    where: { code: '02' },
    select: { id: true, code: true, name: true, isActive: true },
  });
  if (!duplicate) {
    console.log('No boutique with code "02" found. Nothing to do.');
    return;
  }
  if (!duplicate.isActive) {
    console.log('Boutique', duplicate.code, duplicate.name, 'is already disabled.');
    return;
  }
  await prisma.boutique.update({
    where: { id: duplicate.id },
    data: { isActive: false },
  });
  console.log('Disabled duplicate boutique:', duplicate.name, '(' + duplicate.code + ')', 'id=', duplicate.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
