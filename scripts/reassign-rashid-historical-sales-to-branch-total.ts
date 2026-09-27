/**
 * Reassign the 2020-2024 AlRashid historical backfill from employee 2007 to the
 * reserved branch-total system user. Boutique totals remain unchanged, while
 * employee rankings and employee target achievement no longer include these rows.
 *
 * Preview (default):
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' scripts/reassign-rashid-historical-sales-to-branch-total.ts
 * Apply:
 *   ... scripts/reassign-rashid-historical-sales-to-branch-total.ts --apply
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BOUTIQUE_ID = 'bout_rashid_001';
const SOURCE_EMP_ID = '2007';
const SYSTEM_EMP_ID = 'SYSTEM_BRANCH_TOTAL';
const FROM_DATE = '2020-01-01';
const TO_DATE = '2024-12-31';
const EXPECTED = {
  2020: { count: 311, total: 30_060_644 },
  2021: { count: 346, total: 24_334_938 },
  2022: { count: 204, total: 14_548_423 },
  2023: { count: 283, total: 11_138_168 },
  2024: { count: 309, total: 10_630_842 },
} as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const sourceUser = await prisma.user.findUnique({
    where: { empId: SOURCE_EMP_ID },
    select: { id: true, employee: { select: { name: true } } },
  });
  if (!sourceUser) throw new Error(`Source employee ${SOURCE_EMP_ID} was not found`);

  const entries = await prisma.salesEntry.findMany({
    where: {
      boutiqueId: BOUTIQUE_ID,
      userId: sourceUser.id,
      source: 'HISTORICAL_IMPORT',
      dateKey: { gte: FROM_DATE, lte: TO_DATE },
    },
    select: { id: true, dateKey: true, amount: true },
    orderBy: { dateKey: 'asc' },
  });

  const actual = new Map<number, { count: number; total: number }>();
  for (const row of entries) {
    const year = Number(row.dateKey.slice(0, 4));
    const current = actual.get(year) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += row.amount;
    actual.set(year, current);
  }

  for (const [yearText, expected] of Object.entries(EXPECTED)) {
    const year = Number(yearText);
    const found = actual.get(year) ?? { count: 0, total: 0 };
    if (found.count !== expected.count || found.total !== expected.total) {
      throw new Error(
        `Safety check failed for ${year}: expected ${expected.count} rows / ${expected.total} SAR, found ${found.count} rows / ${found.total} SAR`
      );
    }
  }

  const expectedCount = Object.values(EXPECTED).reduce((sum, row) => sum + row.count, 0);
  if (entries.length !== expectedCount) {
    throw new Error(`Safety check failed: expected ${expectedCount} rows, found ${entries.length}`);
  }

  console.table(
    Object.entries(EXPECTED).map(([year, expected]) => ({
      year,
      rows: actual.get(Number(year))?.count ?? 0,
      salesSar: actual.get(Number(year))?.total ?? 0,
      expectedRows: expected.count,
      expectedSalesSar: expected.total,
    }))
  );

  if (!apply) {
    console.log(`PREVIEW ONLY: ${entries.length} rows currently attributed to ${sourceUser.employee?.name ?? SOURCE_EMP_ID}.`);
    console.log('Run again with --apply after confirming the table above.');
    return;
  }

  let systemUser = await prisma.user.findUnique({
    where: { empId: SYSTEM_EMP_ID },
    select: { id: true },
  });

  if (!systemUser) {
    const passwordHash = await bcrypt.hash(
      `branch-total-${BOUTIQUE_ID}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      10
    );
    await prisma.employee.upsert({
      where: { empId: SYSTEM_EMP_ID },
      update: { isSystemOnly: true, active: false },
      create: {
        empId: SYSTEM_EMP_ID,
        name: 'Branch Total',
        boutiqueId: BOUTIQUE_ID,
        team: 'A',
        weeklyOffDay: 0,
        isSystemOnly: true,
        active: false,
      },
    });
    systemUser = await prisma.user.create({
      data: {
        empId: SYSTEM_EMP_ID,
        role: 'ADMIN',
        passwordHash,
        boutiqueId: BOUTIQUE_ID,
        disabled: true,
        mustChangePassword: false,
      },
      select: { id: true },
    });
  }

  const collisions = await prisma.salesEntry.count({
    where: {
      boutiqueId: BOUTIQUE_ID,
      userId: systemUser.id,
      dateKey: { in: entries.map((row) => row.dateKey) },
    },
  });
  if (collisions > 0) {
    throw new Error(`Safety check failed: ${collisions} branch-total rows already exist in the target dates`);
  }

  const result = await prisma.salesEntry.updateMany({
    where: { id: { in: entries.map((row) => row.id) } },
    data: { userId: systemUser.id },
  });
  if (result.count !== entries.length) {
    throw new Error(`Update count mismatch: expected ${entries.length}, updated ${result.count}`);
  }

  console.log(`APPLIED: ${result.count} historical rows now belong to the hidden branch-total account.`);
  console.log('Boutique annual totals are unchanged; employee 2007 no longer receives those sales.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
