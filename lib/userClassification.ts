/**
 * USER CLASSIFICATION — Single source of truth for technical vs operational accounts
 * ---------------------------------------------------------------------------------
 * Technical/system accounts must NEVER appear in operational modules (employees,
 * sales, targets, schedule, leaves, tasks, KPIs, imports, selectors, counts).
 * They remain in DB for auth/admin only. Exception: Memberships / access management.
 *
 * Production-safe: no throws, handles null/undefined/malformed input.
 */

import type { User, Employee, Role } from '@prisma/client';

/** Reserved system empIds (case-insensitive). */
const RESERVED_SYSTEM_EMP_IDS = new Set([
  'admin',
  'super_admin',
  'SYS_SYSTEM',
  'sys_system',
  'SYSTEM',
  'system',
]);

/** Prefixes that identify technical accounts. */
const TECHNICAL_PREFIXES = ['admin_', 'sys_', 'system_'];

/**
 * Normalize employeeId for comparison. Safe: never throws.
 * - Trims whitespace
 * - Returns empty string for null/undefined/non-string
 */
export function normalizeEmployeeId(value: unknown): string {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.trim();
}

/**
 * True if value is a valid numeric employee ID (digits only, non-empty after trim).
 * Safe: never throws.
 */
export function isNumericEmployeeId(value: unknown): boolean {
  const id = normalizeEmployeeId(value);
  if (id === '') return false;
  return /^\d+$/.test(id);
}

/**
 * True if empId is a reserved system identifier (admin, super_admin, SYS_SYSTEM, SYSTEM, etc.).
 * Safe: never throws.
 */
export function isReservedSystemEmpId(value: unknown): boolean {
  const id = normalizeEmployeeId(value);
  if (id === '') return false;
  return RESERVED_SYSTEM_EMP_IDS.has(id.toLowerCase());
}

/**
 * True if empId indicates a technical account (reserved id or admin_/sys_/system_ prefix).
 * Safe: never throws.
 */
export function isTechnicalEmpId(value: unknown): boolean {
  const id = normalizeEmployeeId(value);
  if (id === '') return true;
  if (RESERVED_SYSTEM_EMP_IDS.has(id.toLowerCase())) return true;
  const lower = id.toLowerCase();
  if (TECHNICAL_PREFIXES.some((p) => lower.startsWith(p))) return true;
  if (!/^\d+$/.test(id)) return true;
  return false;
}

/**
 * True if user is a technical/system account (must be hidden from operational modules).
 * Criteria: SUPER_ADMIN or ADMIN role, or missing/non-numeric/reserved/prefixed empId.
 * Safe: never throws.
 */
export function isTechnicalAccount(
  user: Pick<User, 'empId' | 'role'> | null | undefined
): boolean {
  if (!user) return true;
  const role = user.role as Role | undefined;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
  return isTechnicalEmpId(user.empId);
}

/**
 * True if user should be treated as an operational employee (visible in staff lists, counts, etc.).
 * Must have numeric empId and not be a technical account.
 * Safe: never throws.
 */
export function isOperationalUser(user: Pick<User, 'empId' | 'role'> | null | undefined): boolean {
  if (!user) return false;
  return !isTechnicalAccount(user) && isNumericEmployeeId(user.empId);
}

/**
 * True if employee record should appear in operational modules.
 * False when isSystemOnly or when empId is technical.
 * Use for Employee from Prisma (has empId + isSystemOnly).
 */
export function isOperationalEmployee(
  employee: Pick<Employee, 'empId' | 'isSystemOnly'> | null | undefined
): boolean {
  if (!employee) return false;
  if (employee.isSystemOnly === true) return false;
  return !isTechnicalEmpId(employee.empId);
}

/**
 * Filter array to operational employees only. Use after findMany for lists/dropdowns/calculations.
 */
export function filterOperationalEmployees<T extends Pick<Employee, 'empId' | 'isSystemOnly'>>(
  employees: T[]
): T[] {
  if (!Array.isArray(employees)) return [];
  return employees.filter((e) => isOperationalEmployee(e));
}
