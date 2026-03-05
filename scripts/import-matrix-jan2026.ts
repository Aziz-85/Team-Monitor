/**
 * Direct import of TeamMonitor template for Jan 2026.
 * Run: npx tsx scripts/import-matrix-jan2026.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { parseMatrixWorkbook } from '../lib/sales/importMatrix';
import { monthDaysUTC } from '../lib/dates/safeCalendar';
import { normalizeDateOnlyRiyadh } from '../lib/time';

const prisma = new PrismaClient();
const FILE = path.join(__dirname, '../TeamMonitor_Monthly_Import_Template_Matrix copy.xlsx');
const BOUTIQUE_ID = 'bout_dhhrn_001';
const MONTH = '2026-01';

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error('File not found:', FILE);
    process.exit(1);
  }

  const buf = fs.readFileSync(FILE);
  const result = parseMatrixWorkbook(buf);
  if (!result.ok) {
    console.error('Parse error:', result.error);
    process.exit(1);
  }

  const boutique = await prisma.boutique.findUnique({
    where: { id: BOUTIQUE_ID },
    select: { code: true },
  });
  if (!boutique) {
    console.error('Boutique not found');
    process.exit(1);
  }
  const expectedScopeId = (boutique.code ?? '').trim().toUpperCase();

  const matchingCells = result.cells.filter(
    (c) => (c.scopeId ?? '').trim().toUpperCase() === expectedScopeId
  );
  const monthPrefix = MONTH + '-';
  const monthCells = matchingCells.filter((c) => c.dateKey.startsWith(monthPrefix));
  const cellsByDateKey = new Map<string, typeof monthCells>();
  for (const c of monthCells) {
    const list = cellsByDateKey.get(c.dateKey) ?? [];
    list.push(c);
    cellsByDateKey.set(c.dateKey, list);
  }

  const firstDayKey = `${MONTH}-01`;
  if (!cellsByDateKey.has(firstDayKey)) {
    console.error('Month-01 missing. Cells:', Array.from(cellsByDateKey.keys()).slice(0, 5));
    process.exit(1);
  }

  const empIds = Array.from(new Set(monthCells.map((c) => c.empId)));
  const users = await prisma.user.findMany({
    where: { empId: { in: empIds } },
    select: { id: true, empId: true },
  });
  const empIdToUserId = new Map(users.map((u) => [u.empId, u.id]));
  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  const actorId = adminUser?.id ?? users[0]?.id;
  if (!actorId) {
    console.error('No user found for createdById');
    process.exit(1);
  }

  const toUpsert: { dateKey: string; userId: string; amount: number }[] = [];
  for (const dayKey of monthDaysUTC(MONTH)) {
    const dayCells = cellsByDateKey.get(dayKey) ?? [];
    for (const c of dayCells) {
      const userId = empIdToUserId.get(c.empId);
      if (userId) toUpsert.push({ dateKey: c.dateKey, userId, amount: c.amount });
    }
  }

  console.log(`Importing ${toUpsert.length} entries for ${MONTH}...`);

  let inserted = 0;
  let updated = 0;
  for (const { dateKey, userId, amount } of toUpsert) {
    const date = normalizeDateOnlyRiyadh(dateKey);
    const month = dateKey.slice(0, 7);
    const existing = await prisma.salesEntry.findUnique({
      where: { boutiqueId_dateKey_userId: { boutiqueId: BOUTIQUE_ID, dateKey, userId } },
    });
    await prisma.salesEntry.upsert({
      where: { boutiqueId_dateKey_userId: { boutiqueId: BOUTIQUE_ID, dateKey, userId } },
      create: {
        boutiqueId: BOUTIQUE_ID,
        date,
        dateKey,
        month,
        userId,
        amount,
        source: 'IMPORT',
        createdById: actorId,
      },
      update: { amount, source: 'IMPORT', createdById: actorId, updatedAt: new Date() },
    });
    if (existing) updated++;
    else inserted++;
  }

  const day1Sum = toUpsert.filter((u) => u.dateKey === firstDayKey).reduce((s, u) => s + u.amount, 0);
  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}`);
  console.log(`Day 01 (${firstDayKey}) total: ${day1Sum.toLocaleString()} (expected 47,300)`);
  if (day1Sum === 47300) {
    console.log('✓ Day 01 correct!');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
