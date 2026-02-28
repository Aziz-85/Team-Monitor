import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { OFFICIAL_TEMPLATE_CODE, OFFICIAL_TEMPLATE_NAME, getDefaultCellMapJson } from '../lib/kpi/cellMap';

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const adminRashidHash = await bcrypt.hash('AdminRh@123', 10);
  const superAdminHash = await bcrypt.hash('SuperAdmin@123', 10);

  // --- Multi-Boutique Foundation: create default boutique first (User requires boutiqueId) ---
  const org = await prisma.organization.upsert({
    where: { code: 'KOOHEJI' },
    update: {},
    create: { id: 'org_kooheji_001', code: 'KOOHEJI', name: 'Kooheji' },
  });

  const region = await prisma.region.upsert({
    where: { code: 'EASTERN' },
    update: {},
    create: { id: 'reg_eastern_001', code: 'EASTERN', name: 'Eastern', organizationId: org.id },
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

  const unassignedName = '—'; // placeholder when deactivating employees from tasks
  await prisma.employee.upsert({
    where: { empId: 'UNASSIGNED' },
    update: { isSystemOnly: true, name: unassignedName },
    create: {
      empId: 'UNASSIGNED',
      name: unassignedName,
      team: 'A',
      weeklyOffDay: 5,
      active: true,
      isSystemOnly: true,
      language: 'en',
      boutiqueId: defaultBoutique.id,
    },
  });

  await prisma.employee.upsert({
    where: { empId: 'admin' },
    update: { isSystemOnly: true },
    create: {
      empId: 'admin',
      name: 'Admin User',
      email: 'admin@example.com',
      team: 'A',
      weeklyOffDay: 5, // Friday
      active: true,
      isSystemOnly: true,
      language: 'en',
      boutiqueId: defaultBoutique.id,
    },
  });

  await prisma.user.upsert({
    where: { empId: 'admin' },
    update: { boutiqueId: defaultBoutique.id },
    create: {
      empId: 'admin',
      role: 'ADMIN',
      passwordHash: adminHash,
      mustChangePassword: true,
      disabled: false,
      boutiqueId: defaultBoutique.id,
    },
  });

  await prisma.employee.upsert({
    where: { empId: 'super_admin' },
    update: { boutiqueId: defaultBoutique.id },
    create: {
      empId: 'super_admin',
      name: 'Super Admin',
      team: 'A',
      weeklyOffDay: 5,
      active: true,
      isSystemOnly: true,
      language: 'en',
      boutiqueId: defaultBoutique.id,
    },
  });

  await prisma.user.upsert({
    where: { empId: 'super_admin' },
    update: {
      boutiqueId: defaultBoutique.id,
      passwordHash: superAdminHash,
      mustChangePassword: true,
    },
    create: {
      empId: 'super_admin',
      role: 'SUPER_ADMIN',
      passwordHash: superAdminHash,
      mustChangePassword: true,
      disabled: false,
      boutiqueId: defaultBoutique.id,
    },
  });

  const rules = await prisma.coverageRule.count();
  if (rules === 0) {
    await prisma.coverageRule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        minAM: dayOfWeek === 5 ? 0 : 2, // Friday PM-only; others min 2
        minPM: 2, // informational only (agreed display value; enforcement is AM≥PM and AM≥2)
        enabled: true,
      })),
    });
  }

  const alRashidBoutique = await prisma.boutique.upsert({
    where: { id: 'bout_rashid_001' },
    update: { code: 'S02', name: 'AlRashid' },
    create: {
      id: 'bout_rashid_001',
      code: 'S02',
      name: 'AlRashid',
      regionId: region.id,
    },
  });

  await prisma.employee.upsert({
    where: { empId: 'admin_rashid' },
    update: { boutiqueId: alRashidBoutique.id },
    create: {
      empId: 'admin_rashid',
      name: 'Admin Rashid',
      team: 'A',
      weeklyOffDay: 5,
      active: true,
      isSystemOnly: true,
      language: 'en',
      boutiqueId: alRashidBoutique.id,
    },
  });

  await prisma.user.upsert({
    where: { empId: 'admin_rashid' },
    update: { boutiqueId: alRashidBoutique.id },
    create: {
      empId: 'admin_rashid',
      role: 'ADMIN',
      passwordHash: adminRashidHash,
      mustChangePassword: true,
      disabled: false,
      boutiqueId: alRashidBoutique.id,
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
    await prisma.userBoutiqueMembership.upsert({
      where: {
        userId_boutiqueId: { userId: u.id, boutiqueId: alRashidBoutique.id },
      },
      update: { role: u.role },
      create: { userId: u.id, boutiqueId: alRashidBoutique.id, role: u.role },
    });
  }

  // Sample employees for "Add External Coverage" (guest-employees): Dhahran + AlRashid
  await prisma.employee.upsert({
    where: { empId: 'emp_dhahran_1' },
    update: { boutiqueId: defaultBoutique.id },
    create: {
      empId: 'emp_dhahran_1',
      name: 'موظف الظهران ١',
      team: 'A',
      weeklyOffDay: 5,
      active: true,
      isSystemOnly: false,
      language: 'ar',
      boutiqueId: defaultBoutique.id,
    },
  });
  await prisma.employee.upsert({
    where: { empId: 'emp_dhahran_2' },
    update: { boutiqueId: defaultBoutique.id },
    create: {
      empId: 'emp_dhahran_2',
      name: 'موظف الظهران ٢',
      team: 'A',
      weeklyOffDay: 5,
      active: true,
      isSystemOnly: false,
      language: 'ar',
      boutiqueId: defaultBoutique.id,
    },
  });
  // emp_rashid_1, emp_rashid_2 removed — no longer seeded

  const defaultId = defaultBoutique.id;
  await prisma.scheduleEditAudit.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  await prisma.shiftOverride.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  await prisma.coverageRule.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  // boutiqueId is required on these models; backfill only if DB has legacy nulls (use raw to avoid TS error)
  await prisma.$executeRawUnsafe(
    `UPDATE "ScheduleLock" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "ScheduleWeekStatus" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.task.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  await prisma.plannerImportBatch.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  await prisma.plannerImportRow.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  await prisma.auditLog.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  await prisma.approvalRequest.updateMany({ where: { boutiqueId: null }, data: { boutiqueId: defaultId } });
  await prisma.$executeRawUnsafe(
    `UPDATE "InventoryRotationConfig" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "InventoryDailyRun" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "InventoryZone" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "BoutiqueMonthlyTarget" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "EmployeeMonthlyTarget" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "SalesTargetAudit" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "SalesEntry" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "SalesEditGrant" SET "boutiqueId" = $1 WHERE "boutiqueId" IS NULL`,
    defaultId
  );

  await prisma.kpiTemplate.upsert({
    where: { code: OFFICIAL_TEMPLATE_CODE },
    update: { cellMapJson: getDefaultCellMapJson(), updatedAt: new Date() },
    create: {
      code: OFFICIAL_TEMPLATE_CODE,
      name: OFFICIAL_TEMPLATE_NAME,
      version: '1',
      isActive: true,
      cellMapJson: getDefaultCellMapJson(),
    },
  });

  console.log('Seed completed. Admin: empId=admin, password=Admin@123. Super Admin: empId=super_admin, password=SuperAdmin@123');
  console.log('Multi-boutique foundation: DEFAULT_BOUTIQUE_ID =', defaultBoutique.id);
  console.log('Boutiques: S05 Dhahran Mall, S02 AlRashid');
  console.log('KPI template:', OFFICIAL_TEMPLATE_CODE);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
