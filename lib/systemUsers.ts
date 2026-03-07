/**
 * SYSTEM USERS — Filter for operational data
 * ------------------------------------------
 * Delegates to lib/userClassification.ts (single source of truth).
 * Re-exports for backward compatibility. Use userClassification in new code.
 *
 * System accounts must NEVER appear in operational modules.
 * Exception: ADMIN → Memberships may show them for access management.
 */

import type { User, Employee } from '@prisma/client';
import {
  isTechnicalEmpId,
  isTechnicalAccount,
  isOperationalEmployee as isOperationalEmployeeImpl,
  filterOperationalEmployees as filterOperationalEmployeesImpl,
} from '@/lib/userClassification';

/** @deprecated Use isTechnicalEmpId from userClassification. True if empId is non-operational. */
export function isSystemEmpId(empId: string | null | undefined): boolean {
  return isTechnicalEmpId(empId);
}

/** True if user is a system account (hidden from operational data). */
export function isSystemUser(user: Pick<User, 'empId' | 'role'> | null | undefined): boolean {
  return isTechnicalAccount(user);
}

/** True if employee should appear in operational lists. */
export function isOperationalEmployee(
  employee: Pick<Employee, 'empId' | 'isSystemOnly'>
): boolean {
  return isOperationalEmployeeImpl(employee);
}

/** Filter array to operational employees only. */
export function filterOperationalEmployees<T extends Pick<Employee, 'empId' | 'isSystemOnly'>>(
  employees: T[]
): T[] {
  return filterOperationalEmployeesImpl(employees);
}
