/**
 * Map Microsoft users to local employees.
 * Fallback: returns null if no PlannerUserMap match and no Employee with matching email.
 * Unmapped user → inbound skips TaskCompletion creation.
 */

import { prisma } from '@/lib/db';

export async function resolveEmployeeIdFromMicrosoft(
  boutiqueId: string | null,
  microsoftEmail: string | null,
  microsoftDisplayName: string | null,
  microsoftUserId: string | null
): Promise<string | null> {
  if (!boutiqueId && !microsoftEmail && !microsoftUserId) return null;

  const map = await prisma.plannerUserMap.findFirst({
    where: {
      active: true,
      ...(boutiqueId ? { boutiqueId } : { boutiqueId: null }),
      OR: [
        ...(microsoftEmail ? [{ microsoftEmail }] : []),
        ...(microsoftUserId ? [{ microsoftUserId }] : []),
      ],
    },
    select: { employeeId: true },
  });
  if (map) return map.employeeId;

  if (microsoftEmail) {
    const emp = await prisma.employee.findFirst({
      where: { email: microsoftEmail, active: true, ...(boutiqueId ? { boutiqueId } : {}) },
      select: { empId: true },
    });
    if (emp) return emp.empId;
  }

  return null;
}
