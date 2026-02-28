/**
 * Reset database for production launch: remove all trial data, keep only ADMIN users
 * and system employees (admin, UNASSIGNED). Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reset-for-production.ts
 *
 * Keeps:
 * - Users with role ADMIN (admin + sys admin)
 * - Employees linked to those users + UNASSIGNED
 * - Organization, Region, Boutique, SystemConfig, CoverageRule (foundation)
 *
 * Deletes: all sales, tasks, schedules, leaves, inventory, audits, and non-admin users/employees.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KEEP_EMP_IDS = ['admin', 'UNASSIGNED'];

async function main() {
  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, empId: true },
  });
  const keepEmpIds = new Set(KEEP_EMP_IDS);
  for (const u of adminUsers) keepEmpIds.add(u.empId);

  console.log('Keeping ADMIN users:', adminUsers.map((u) => u.empId).join(', '));
  console.log('Keeping employees:', Array.from(keepEmpIds).join(', '));

  // --- 1. Sales ledger (order: lines -> batches -> summaries -> audit) ---
  await prisma.boutiqueSalesLine.deleteMany({});
  await prisma.salesImportBatch.deleteMany({});
  await prisma.boutiqueSalesSummary.deleteMany({});
  await prisma.salesLedgerAudit.deleteMany({});
  console.log('Cleared sales ledger.');

  // --- 2. Legacy sales + targets ---
  await prisma.salesEntry.deleteMany({});
  await prisma.salesEditGrant.deleteMany({});
  await prisma.employeeMonthlyTarget.deleteMany({});
  await prisma.boutiqueMonthlyTarget.deleteMany({});
  await prisma.salesTargetAudit.deleteMany({});
  console.log('Cleared sales entries and targets.');

  // --- 3. Tasks ---
  await prisma.taskCompletion.deleteMany({});
  await prisma.taskPlan.deleteMany({});
  await prisma.taskSchedule.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.plannerImportRow.deleteMany({});
  await prisma.plannerImportBatch.deleteMany({});
  console.log('Cleared tasks and planner imports.');

  // --- 4. Schedule ---
  await prisma.scheduleLock.deleteMany({});
  await prisma.scheduleWeekStatus.deleteMany({});
  await prisma.shiftOverride.deleteMany({});
  await prisma.scheduleEditAudit.deleteMany({});
  console.log('Cleared schedule data.');

  // --- 5. Leaves ---
  await prisma.leaveRequest.deleteMany({});
  await prisma.leave.deleteMany({});
  console.log('Cleared leaves.');

  // --- 6. Approvals, audit, notifications ---
  await prisma.approvalRequest.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.authAuditLog.deleteMany({});
  console.log('Cleared approvals and audit logs.');

  // --- 7. Inventory ---
  await prisma.inventoryDailyWaitingQueue.deleteMany({});
  await prisma.inventoryZoneAssignment.deleteMany({});
  await prisma.inventoryWeeklyZoneRun.deleteMany({});
  await prisma.inventoryDailyRunSkip.deleteMany({});
  await prisma.inventoryAbsent.deleteMany({});
  await prisma.inventoryDailyExclusion.deleteMany({});
  await prisma.inventoryDailyRun.deleteMany({});
  await prisma.inventoryRotationMember.deleteMany({});
  await prisma.inventoryRotationConfig.deleteMany({});
  await prisma.inventoryZone.deleteMany({});
  console.log('Cleared inventory data.');

  // --- 8. User-related (preferences, memberships - will re-seed for admin) ---
  await prisma.userPreference.deleteMany({});
  await prisma.userBoutiqueMembership.deleteMany({});
  console.log('Cleared user preferences and memberships.');

  // --- 9. Delete non-ADMIN users (cascade will clean remaining refs) ---
  const deletedUsers = await prisma.user.deleteMany({
    where: { role: { not: 'ADMIN' } },
  });
  console.log('Deleted non-ADMIN users:', deletedUsers.count);

  // --- 10. Delete employees that are not kept (admin, UNASSIGNED, or linked to kept users) ---
  const allEmployees = await prisma.employee.findMany({ select: { empId: true } });
  const toDelete = allEmployees.filter((e) => !keepEmpIds.has(e.empId)).map((e) => e.empId);
  if (toDelete.length > 0) {
    await prisma.employeeTeamAssignment.deleteMany({ where: { empId: { in: toDelete } } });
    await prisma.employeeTeamHistory.deleteMany({ where: { empId: { in: toDelete } } });
    await prisma.leave.deleteMany({ where: { empId: { in: toDelete } } });
    await prisma.shiftOverride.deleteMany({ where: { empId: { in: toDelete } } });
    await prisma.employee.deleteMany({ where: { empId: { in: toDelete } } });
    console.log('Deleted employees:', toDelete.length, toDelete.slice(0, 5).join(', ') + (toDelete.length > 5 ? '...' : ''));
  }

  // --- 11. Re-create memberships and preferences for kept ADMIN users (so they can log in and have scope) ---
  const defaultBoutiqueId = await prisma.systemConfig
    .findUnique({ where: { key: 'DEFAULT_BOUTIQUE_ID' } })
    .then((c) => (c?.valueJson ? JSON.parse(c.valueJson) as string : null));
  if (defaultBoutiqueId) {
    for (const u of adminUsers) {
      await prisma.userBoutiqueMembership.upsert({
        where: {
          userId_boutiqueId: { userId: u.id, boutiqueId: defaultBoutiqueId },
        },
        update: { role: 'ADMIN' },
        create: { userId: u.id, boutiqueId: defaultBoutiqueId, role: 'ADMIN' },
      });
    }
    console.log('Re-created boutique memberships for ADMIN users.');
  }

  console.log('Reset complete. Only ADMIN users and system employees remain.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
