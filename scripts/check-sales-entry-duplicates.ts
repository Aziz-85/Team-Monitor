/**
 * Dev/ops: verify no duplicate (boutiqueId, dateKey, userId) keys.
 * DB unique index should prevent this; run after migrations or imports if suspicious.
 *
 *   npx tsx scripts/check-sales-entry-duplicates.ts
 */

import { prisma } from '../lib/db';

async function main() {
  const rows = await prisma.$queryRaw<
    { boutiqueId: string; dateKey: string; userId: string; c: bigint }[]
  >`
    SELECT "boutiqueId", "dateKey", "userId", COUNT(*)::bigint AS c
    FROM "SalesEntry"
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
  `;
  if (rows.length === 0) {
    console.log('OK: no duplicate keys.');
    return;
  }
  console.error('DUPLICATES FOUND:', rows.length);
  for (const r of rows) {
    console.error(r);
  }
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
