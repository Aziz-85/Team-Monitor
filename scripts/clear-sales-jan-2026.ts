/**
 * Clear SalesEntry + BoutiqueSalesSummary for Jan 2026 (bout_dhhrn_001) to allow clean re-import.
 * Use when day-1 data is wrong (e.g. 177450 under 01 instead of 47300).
 *
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/clear-sales-jan-2026.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BOUTIQUE_ID = 'bout_dhhrn_001';
const MONTH = '2026-01';

async function main() {
  // 1) Show current SalesEntry totals by dateKey
  const byDate = await prisma.salesEntry.groupBy({
    by: ['dateKey'],
    where: { boutiqueId: BOUTIQUE_ID, month: MONTH },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { dateKey: 'asc' },
  });

  console.log(`\nSalesEntry for ${BOUTIQUE_ID} / ${MONTH}:`);
  console.log('dateKey      | sum(amount) | count');
  console.log('-------------|-------------|------');
  for (const r of byDate) {
    const sum = r._sum.amount ?? 0;
    console.log(`${r.dateKey} | ${sum.toLocaleString().padStart(11)} | ${r._count.id}`);
  }

  const monthStart = new Date(Date.UTC(2026, 0, 1));
  const monthEnd = new Date(Date.UTC(2026, 1, 0));

  // 2) Delete BoutiqueSalesSummary (cascades to BoutiqueSalesLine)
  const deletedSummaries = await prisma.boutiqueSalesSummary.deleteMany({
    where: {
      boutiqueId: BOUTIQUE_ID,
      date: { gte: monthStart, lte: monthEnd },
    },
  });
  console.log(`\nDeleted ${deletedSummaries.count} BoutiqueSalesSummary rows for ${MONTH}.`);

  // 3) Delete SalesEntry
  const deleted = await prisma.salesEntry.deleteMany({
    where: { boutiqueId: BOUTIQUE_ID, month: MONTH },
  });
  console.log(`Deleted ${deleted.count} SalesEntry rows for ${MONTH}.`);
  console.log('\nRe-import Jan 2026 from Import → Monthly Matrix (or Sales → Monthly Import) with month=2026-01 and Force overwrite.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
