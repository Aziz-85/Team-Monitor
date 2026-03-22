/**
 * Preflight: detect duplicate (boutiqueId, dateKey, userId) groups in SalesEntry.
 * The DB unique index should keep this empty; run after restores or before migrations.
 *
 * Usage: npx tsx scripts/detect-sales-entry-duplicates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<
    { boutiqueId: string; dateKey: string; userId: string; c: bigint }[]
  >`
    SELECT "boutiqueId", "dateKey", "userId", COUNT(*)::bigint AS c
    FROM "SalesEntry"
    GROUP BY "boutiqueId", "dateKey", "userId"
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 500
  `;
  if (rows.length === 0) {
    console.log('No duplicate (boutiqueId, dateKey, userId) groups found.');
    return;
  }
  console.error(`Found ${rows.length} duplicate key group(s):`);
  for (const r of rows) {
    console.error({ boutiqueId: r.boutiqueId, dateKey: r.dateKey, userId: r.userId, count: r.c });
  }
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
