/**
 * OPERATIONAL EMPLOYEES — Single source for operational employee lists
 * --------------------------------------------------------------------
 * All operational pages (schedule, tasks, inventory, leaves, sales) MUST use
 * this helper. Filters by Employee.boutiqueId = boutiqueId only.
 * Deterministic ordering: team, name, empId.
 */

import { prisma } from '@/lib/db';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import { employeeOrderByStable } from '@/lib/employee/employeeQuery';
import type { Employee } from '@prisma/client';

/**
 * Get employees for operational pages. REQUIRES boutiqueId.
 * Throws in dev if boutiqueId is missing/empty.
 */
export async function getOperationalEmployees(
  boutiqueId: string
): Promise<Employee[]> {
  if (!boutiqueId || typeof boutiqueId !== 'string' || boutiqueId.trim() === '') {
    if (process.env.NODE_ENV === 'development') {
      throw new Error('getOperationalEmployees: boutiqueId is required');
    }
    return [];
  }
  const bid = boutiqueId?.trim();
  if (!bid) return [];

  const employees = await prisma.employee.findMany({
    where: {
      boutiqueId: bid,
      active: true,
      isSystemOnly: false,
      ...notDisabledUserWhere,
    },
    orderBy: employeeOrderByStable,
  });
  return employees as Employee[];
}

/**
 * Get operational employees with empId and name (for dropdowns).
 */
export async function getOperationalEmployeesSelect(
  boutiqueId: string
): Promise<Array<{ empId: string; name: string }>> {
  if (!boutiqueId?.trim()) return [];
  const employees = await prisma.employee.findMany({
    where: {
      boutiqueId: boutiqueId.trim(),
      active: true,
      isSystemOnly: false,
      ...notDisabledUserWhere,
    },
    select: { empId: true, name: true },
    orderBy: employeeOrderByStable,
  });
  return employees;
}
