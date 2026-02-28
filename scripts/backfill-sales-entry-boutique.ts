/**
 * One-off backfill: set SalesEntry.boutiqueId where null.
 * Uses User.empId -> Employee.boutiqueId when available; else SystemConfig.DEFAULT_BOUTIQUE_ID.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-sales-entry-boutique.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_BOUTIQUE_ID = 'bout_dhhrn_001';

async function getDefaultBoutiqueId(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'DEFAULT_BOUTIQUE_ID' },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return DEFAULT_BOUTIQUE_ID;
  try {
    const id = JSON.parse(row.valueJson) as string;
    return typeof id === 'string' ? id : DEFAULT_BOUTIQUE_ID;
  } catch {
    return DEFAULT_BOUTIQUE_ID;
  }
}

async function main() {
  const defaultId = await getDefaultBoutiqueId();
  const nullEntries = await prisma.$queryRaw<{ id: string; userId: string }[]>`
    SELECT id, "userId" FROM "SalesEntry" WHERE "boutiqueId" IS NULL
  `;
  if (nullEntries.length === 0) {
    console.log('No SalesEntry rows with null boutiqueId.');
    return;
  }
  const userIds = Array.from(new Set(nullEntries.map((e) => e.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, empId: true },
  });
  const employees = await prisma.employee.findMany({
    where: { empId: { in: users.map((u) => u.empId) } },
    select: { empId: true, boutiqueId: true },
  });
  const empIdToBoutique = new Map(employees.map((e) => [e.empId, e.boutiqueId]));
  const userToBoutique = new Map<string, string>();
  for (const u of users) {
    const bid = u.empId ? empIdToBoutique.get(u.empId) : null;
    userToBoutique.set(u.id, bid ?? defaultId);
  }
  let updated = 0;
  for (const entry of nullEntries) {
    const bid = userToBoutique.get(entry.userId) ?? defaultId;
    await prisma.salesEntry.update({
      where: { id: entry.id },
      data: { boutiqueId: bid },
    });
    updated++;
  }
  console.log(`Backfilled ${updated} SalesEntry rows with boutiqueId.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
