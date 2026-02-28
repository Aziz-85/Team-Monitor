/**
 * When an employee is deactivated (active = false), remove them from all assignments
 * so they no longer appear in tasks, schedule overrides, inventory rotations, etc.
 * Historical data (leaves, sales entries, targets) is kept for reporting.
 */

import { prisma } from '@/lib/db';
import { clearCoverageValidationCache } from '@/lib/services/coverageValidation';

const UNASSIGNED_EMP_ID = 'UNASSIGNED';

export async function deactivateEmployeeCascade(empId: string): Promise<void> {
  if (empId === UNASSIGNED_EMP_ID) return;

  await prisma.$transaction(async (tx) => {
    await tx.employee.upsert({
      where: { empId: UNASSIGNED_EMP_ID },
      update: {},
      create: {
        empId: UNASSIGNED_EMP_ID,
        name: '—',
        team: 'A',
        weeklyOffDay: 5,
        active: true,
        isSystemOnly: true,
        language: 'en',
      },
    });

    // Tasks: reassign primary/backup1/backup2 to UNASSIGNED placeholder
    await tx.taskPlan.updateMany({
      where: { primaryEmpId: empId },
      data: { primaryEmpId: UNASSIGNED_EMP_ID },
    });
    await tx.taskPlan.updateMany({
      where: { backup1EmpId: empId },
      data: { backup1EmpId: UNASSIGNED_EMP_ID },
    });
    await tx.taskPlan.updateMany({
      where: { backup2EmpId: empId },
      data: { backup2EmpId: UNASSIGNED_EMP_ID },
    });

    // Schedule: remove all overrides for this employee
    await tx.shiftOverride.deleteMany({ where: { empId } });

    // Inventory rotation: remove from rotation configs
    await tx.inventoryRotationMember.deleteMany({ where: { empId } });

    // Zone assignments: deactivate so they're no longer assigned to zones
    await tx.inventoryZoneAssignment.updateMany({
      where: { empId },
      data: { active: false },
    });

    // Daily inventory waiting queue: remove so they're not in queue
    await tx.inventoryDailyWaitingQueue.deleteMany({ where: { empId } });
  });

  clearCoverageValidationCache();
}
