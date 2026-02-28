/**
 * Metrics scope — single resolution for all KPI APIs so dashboard, sales/my, me/target use the same boutique + employee.
 * EMPLOYEE/ASSISTANT_MANAGER: always Employee.boutiqueId (cannot switch). MANAGER/ADMIN/SUPER_ADMIN: operational scope (?b= for SUPER_ADMIN).
 */

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getEmployeeBoutiqueIdForUser } from '@/lib/boutique/resolveOperationalBoutique';
import type { Role } from '@prisma/client';

export type MetricsScopeResult = {
  userId: string;
  role: Role;
  empId: string | null;
  /** Single boutique for metrics (sales, targets). */
  effectiveBoutiqueId: string;
  /** When true, only this user's data is allowed (EMPLOYEE). */
  employeeOnly: boolean;
  label: string;
};

const EMPLOYEE_SCOPE_ROLES: Role[] = ['EMPLOYEE', 'ASSISTANT_MANAGER'];

/**
 * Resolve scope for metrics APIs. Use in dashboard, me/targets, me/sales, sales/summary so all show same numbers.
 * - EMPLOYEE / ASSISTANT_MANAGER: effectiveBoutiqueId = Employee.boutiqueId (via User.empId). employeeOnly = true for EMPLOYEE.
 * - MANAGER / ADMIN / SUPER_ADMIN: effectiveBoutiqueId from getOperationalScope (session or ?b=). employeeOnly = false.
 */
export async function resolveMetricsScope(
  request?: NextRequest | null
): Promise<MetricsScopeResult | null> {
  const user = await getSessionUser();
  if (!user?.id) return null;

  const role = user.role as Role;

  if (EMPLOYEE_SCOPE_ROLES.includes(role)) {
    const empBoutiqueId = await getEmployeeBoutiqueIdForUser(user.id);
    const boutiqueId = empBoutiqueId ?? (user as { boutiqueId?: string }).boutiqueId ?? '';
    if (!boutiqueId) return null;
    const b = (user as { boutique?: { name: string; code: string } }).boutique;
    const label = b ? `${b.name} (${b.code})` : boutiqueId;
    return {
      userId: user.id,
      role,
      empId: user.empId ?? null,
      effectiveBoutiqueId: boutiqueId,
      employeeOnly: role === 'EMPLOYEE',
      label,
    };
  }

  const op = await getOperationalScope(request ?? undefined);
  if (!op?.boutiqueId) return null;

  return {
    userId: user.id,
    role,
    empId: op.empId,
    effectiveBoutiqueId: op.boutiqueId,
    employeeOnly: false,
    label: op.label,
  };
}
