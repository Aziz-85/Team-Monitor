/**
 * Multi-Boutique Foundation (Phase 1) – Seed + Backfill (idempotent).
 * Run once after applying migration 20260220000000_multi_boutique_foundation.
 * Safe to re-run (upserts and updateMany where null only).
 *
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' -r tsconfig-paths/register scripts/backfill-boutique-foundation.ts
 * Or: npm run db:seed (seed.ts includes this logic).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { code: 'KOOHEJI' },
    update: {},
    create: { code: 'KOOHEJI', name: 'Kooheji' },
  });

  const region = await prisma.region.upsert({
    where: { code: 'EASTERN' },
    update: {},
    create: { code: 'EASTERN', name: 'Eastern', organizationId: org.id },
  });

  const defaultBoutique = await prisma.boutique.upsert({
    where: { id: 'bout_dhhrn_001' },
    update: { code: 'S05', name: 'Dhahran Mall' },
    create: {
      id: 'bout_dhhrn_001',
      code: 'S05',
      name: 'Dhahran Mall',
      regionId: region.id,
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'DEFAULT_BOUTIQUE_ID' },
    update: { valueJson: JSON.stringify(defaultBoutique.id) },
    create: { key: 'DEFAULT_BOUTIQUE_ID', valueJson: JSON.stringify(defaultBoutique.id) },
  });

  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  for (const u of users) {
    await prisma.userBoutiqueMembership.upsert({
      where: {
        userId_boutiqueId: { userId: u.id, boutiqueId: defaultBoutique.id },
      },
      update: { role: u.role },
      create: { userId: u.id, boutiqueId: defaultBoutique.id, role: u.role },
    });
  }

  const defaultId = defaultBoutique.id;
  const tables = [
    ['ScheduleEditAudit', prisma.scheduleEditAudit.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['ShiftOverride', prisma.shiftOverride.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['CoverageRule', prisma.coverageRule.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['ScheduleLock', prisma.$executeRawUnsafe(`UPDATE "ScheduleLock" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`, defaultId).then((n) => ({ count: Number(n) }))],
    ['ScheduleWeekStatus', prisma.$executeRawUnsafe(`UPDATE "ScheduleWeekStatus" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`, defaultId).then((n) => ({ count: Number(n) }))],
    ['Task', prisma.task.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['PlannerImportBatch', prisma.plannerImportBatch.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['PlannerImportRow', prisma.plannerImportRow.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['AuditLog', prisma.auditLog.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['ApprovalRequest', prisma.approvalRequest.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } })],
    ['InventoryRotationConfig', prisma.inventoryRotationConfig.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
    ['InventoryDailyRun', prisma.inventoryDailyRun.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
    ['InventoryZone', prisma.inventoryZone.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
    ['BoutiqueMonthlyTarget', prisma.boutiqueMonthlyTarget.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
    ['EmployeeMonthlyTarget', prisma.employeeMonthlyTarget.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
    ['SalesTargetAudit', prisma.salesTargetAudit.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
    ['SalesEntry', prisma.salesEntry.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
    ['SalesEditGrant', prisma.salesEditGrant.updateMany({ where: { boutiqueId: { equals: null as unknown as string } }, data: { boutiqueId: defaultId } })],
  ] as const;

  for (const [name, p] of tables) {
    const r = await p;
    if (r.count > 0) console.log(`Backfilled ${name}: ${r.count} rows`);
  }

  console.log('Backfill done. DEFAULT_BOUTIQUE_ID =', defaultBoutique.id);
  console.log('Next: npx prisma migrate deploy (to apply NOT NULL migration if pending).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
