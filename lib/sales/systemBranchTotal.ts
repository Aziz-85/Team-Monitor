/**
 * System user/employee pair for "branch daily total only" SalesEntry rows.
 * One global User (unique empId) — SalesEntry is still scoped by boutiqueId + dateKey + userId.
 */

import * as bcrypt from 'bcryptjs';
import { Team } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  SYSTEM_BRANCH_TOTAL_EMP_ID,
  SYSTEM_BRANCH_TOTAL_NAME,
} from '@/lib/sales/systemBranchTotalConstants';

export { SYSTEM_BRANCH_TOTAL_EMP_ID, SYSTEM_BRANCH_TOTAL_NAME } from '@/lib/sales/systemBranchTotalConstants';

export async function getSystemBranchTotalUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    where: { empId: SYSTEM_BRANCH_TOTAL_EMP_ID },
    select: { id: true },
  });
  return u?.id ?? null;
}

export function isSystemBranchTotalEmpId(empId: string | null | undefined): boolean {
  return (empId ?? '').trim() === SYSTEM_BRANCH_TOTAL_EMP_ID;
}

export function isSalesEntryUserSystemBranchTotal(
  user: { empId: string } | null | undefined
): boolean {
  return user != null && isSystemBranchTotalEmpId(user.empId);
}

/**
 * Ensures Employee + User exist for branch daily totals. Idempotent.
 * `boutiqueId` seeds Employee.boutiqueId and User.boutiqueId on first create only.
 */
export async function ensureSystemBranchTotalUserForBoutique(boutiqueId: string): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { empId: SYSTEM_BRANCH_TOTAL_EMP_ID },
    select: { id: true },
  });
  if (existing) return existing.id;

  const passwordHash = await bcrypt.hash(
    `branch-total-${boutiqueId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    10
  );

  await prisma.employee.create({
    data: {
      empId: SYSTEM_BRANCH_TOTAL_EMP_ID,
      name: SYSTEM_BRANCH_TOTAL_NAME,
      boutiqueId,
      team: Team.A,
      weeklyOffDay: 0,
      isSystemOnly: true,
      active: false,
    },
  });

  const user = await prisma.user.create({
    data: {
      empId: SYSTEM_BRANCH_TOTAL_EMP_ID,
      role: 'ADMIN',
      passwordHash,
      boutiqueId,
      disabled: true,
      mustChangePassword: false,
    },
    select: { id: true },
  });
  return user.id;
}
