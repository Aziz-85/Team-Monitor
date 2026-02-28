/**
 * OPERATIONAL ROSTER — Single source of truth: Employee.boutiqueId
 * ---------------------------------------------------------------
 * Server-only. Use for ALL operational pages (schedule, tasks, inventory, sales, leaves).
 * UserBoutiqueMembership = LOGIN ACCESS only. Roster membership = Employee.boutiqueId + Employee.active.
 */

import { prisma } from '@/lib/db';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';
import type { ScopeSelectionJson } from '@/lib/scope/types';
import type { Employee, Prisma, Role } from '@prisma/client';

export type ResolveOperationalResult = {
  boutiqueIds: string[];
  label: string;
};

/**
 * Resolve operational boutique scope for a user.
 * Uses stored preference + role; never trust client-provided scope for filtering.
 */
export async function resolveOperationalBoutiqueIds(
  userId: string,
  role: Role,
  requestedScope?: ScopeSelectionJson | null
): Promise<ResolveOperationalResult> {
  const resolved = await resolveScopeForUser(userId, role, requestedScope ?? null);
  return {
    boutiqueIds: resolved.boutiqueIds,
    label: resolved.label,
  };
}

export type GetOperationalEmployeesOptions = {
  orderBy?: Prisma.EmployeeOrderByWithRelationInput[];
  select?: Record<string, boolean>;
  excludeSystemOnly?: boolean;
};

/**
 * Get employees that belong to the given boutiques (operational roster).
 * Filters: Employee.boutiqueId IN boutiqueIds, active=true, isSystemOnly=false (unless overridden), notDisabledUserWhere.
 * Uses stable orderBy for deterministic ordering across all operational pages.
 */
export async function getOperationalEmployees(
  boutiqueIds: string[],
  options: GetOperationalEmployeesOptions = {}
): Promise<Employee[]> {
  if (!boutiqueIds.length) {
    return [];
  }
  const { orderBy = employeeOrderByStable, select, excludeSystemOnly = true } = options;

  const employees = await prisma.employee.findMany({
    where: buildEmployeeWhereForOperational(boutiqueIds, { excludeSystemOnly }),
    ...(select ? { select } : {}),
    orderBy,
  });
  return employees as Employee[];
}

/**
 * Get operational employee empIds only (for allowlists / validation).
 */
export async function getOperationalEmpIds(boutiqueIds: string[]): Promise<Set<string>> {
  if (!boutiqueIds.length) return new Set();
  const rows = await prisma.employee.findMany({
    where: buildEmployeeWhereForOperational(boutiqueIds),
    select: { empId: true },
    orderBy: employeeOrderByStable,
  });
  return new Set(rows.map((e) => e.empId));
}

/** Thrown when an employee is not in the current operational scope. */
export class EmployeeOutOfScopeError extends Error {
  code = 'CROSS_BOUTIQUE_BLOCKED' as const;
  empId: string;
  boutiqueIds: string[];

  constructor(empId: string, boutiqueIds: string[]) {
    super(`Employee ${empId} is not in boutique scope`);
    this.name = 'EmployeeOutOfScopeError';
    this.empId = empId;
    this.boutiqueIds = [...boutiqueIds];
  }
}

/**
 * Assert that the employee belongs to one of the given boutiques.
 * Throws EmployeeOutOfScopeError (400) if not. Use before any assign/save that references an employee.
 */
export async function assertEmployeeInBoutiqueScope(
  empId: string,
  boutiqueIds: string[]
): Promise<void> {
  if (!boutiqueIds.length) {
    throw new EmployeeOutOfScopeError(empId, []);
  }
  const employee = await prisma.employee.findUnique({
    where: { empId },
    select: { boutiqueId: true },
  });
  if (!employee || !boutiqueIds.includes(employee.boutiqueId)) {
    throw new EmployeeOutOfScopeError(empId, boutiqueIds);
  }
}

/**
 * Assert multiple employees; throws on first mismatch with list of invalid empIds in message.
 */
export async function assertEmployeesInBoutiqueScope(
  empIds: string[],
  boutiqueIds: string[]
): Promise<void> {
  if (!boutiqueIds.length) {
    if (empIds.length) throw new EmployeeOutOfScopeError(empIds[0], []);
    return;
  }
  const unique = Array.from(new Set(empIds));
  const employees = await prisma.employee.findMany({
    where: { empId: { in: unique } },
    select: { empId: true, boutiqueId: true },
  });
  const byEmpId = new Map(employees.map((e) => [e.empId, e.boutiqueId]));
  const invalid: string[] = [];
  for (const id of unique) {
    const bId = byEmpId.get(id);
    if (!bId || !boutiqueIds.includes(bId)) invalid.push(id);
  }
  if (invalid.length) {
    const err = new EmployeeOutOfScopeError(invalid[0], boutiqueIds);
    err.message = `Employees not in boutique scope: ${invalid.join(', ')}`;
    (err as { invalidEmpIds?: string[] }).invalidEmpIds = invalid;
    throw err;
  }
}

/**
 * Assert all empIds exist, are active, and not system-only.
 * Use for schedule save so both in-scope and guest (other-branch) employees are allowed.
 * Throws with invalidEmpIds for 400 response.
 */
export async function assertEmployeesExistForSchedule(empIds: string[]): Promise<void> {
  const unique = Array.from(new Set(empIds)).filter(Boolean);
  if (unique.length === 0) return;
  const employees = await prisma.employee.findMany({
    where: { empId: { in: unique }, active: true, isSystemOnly: false },
    select: { empId: true },
  });
  const found = new Set(employees.map((e) => e.empId));
  const invalid = unique.filter((id) => !found.has(id));
  if (invalid.length) {
    const err = new Error(`Employees not found or inactive: ${invalid.join(', ')}`);
    (err as { invalidEmpIds?: string[] }).invalidEmpIds = invalid;
    throw err;
  }
}

/**
 * Get employee by empId (canonical id). Returns null if not found.
 * Use for validation before writes; roster membership is always Employee.boutiqueId.
 */
export async function getEmployeeByEmpId(empId: string): Promise<Employee | null> {
  const e = await prisma.employee.findUnique({
    where: { empId },
  });
  return e;
}

/**
 * Validate empId exists and return it (for APIs that need to ensure employee exists).
 * Throws if not found.
 */
export async function requireEmployeeByEmpId(empId: string): Promise<string> {
  const exists = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true },
  });
  if (!exists) throw new Error(`Employee not found: ${empId}`);
  return empId;
}

/** Audit module for cross-boutique blocked events */
export type CrossBoutiqueBlockedModule =
  | 'SCHEDULE'
  | 'TASKS'
  | 'INVENTORY'
  | 'SALES'
  | 'LEAVES'
  | 'OPERATIONAL';

/**
 * Log a CROSS_BOUTIQUE_BLOCKED audit event (actorId, module, requestedEmpIds, scopeBoutiqueIds).
 */
export async function logCrossBoutiqueBlocked(
  actorUserId: string,
  module: CrossBoutiqueBlockedModule,
  invalidEmpIds: string[],
  scopeBoutiqueIds: string[],
  reason?: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: 'CROSS_BOUTIQUE_BLOCKED',
      entityType: 'OperationalRoster',
      entityId: null,
      beforeJson: null,
      afterJson: JSON.stringify({
        reason: reason ?? 'Employee not in boutique scope',
        invalidEmpIds,
        scopeBoutiqueIds,
      }),
      reason: reason ?? null,
      module,
      boutiqueId: scopeBoutiqueIds[0] ?? null,
      targetEmployeeId: invalidEmpIds[0] ?? null,
    },
  });
}
