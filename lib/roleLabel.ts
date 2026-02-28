/**
 * Central display labels for User Role and Employee Position (job titles).
 * Use getRoleDisplayLabel(role, position?, t) everywhere we show "Role" to the user.
 * - For EMPLOYEE: shows position label (Sales, Senior Sales, etc.) when available; otherwise "Employee".
 * - For others: Assistant Manager, Manager, Admin.
 */

import type { Role } from '@prisma/client';
import type { EmployeePosition } from '@prisma/client';

export type TranslateFn = (key: string) => string;

const ROLE_KEYS: Record<Role, string> = {
  EMPLOYEE: 'adminEmp.roleEmployee',
  ASSISTANT_MANAGER: 'adminEmp.roleAssistantManager',
  MANAGER: 'adminEmp.roleManager',
  ADMIN: 'adminEmp.roleAdmin',
  SUPER_ADMIN: 'adminEmp.roleSuperAdmin',
};

const POSITION_KEYS: Record<EmployeePosition, string> = {
  BOUTIQUE_MANAGER: 'adminEmp.positionBoutiqueManager',
  ASSISTANT_MANAGER: 'adminEmp.positionAssistantManager',
  SENIOR_SALES: 'adminEmp.positionSeniorSales',
  SALES: 'adminEmp.positionSales',
};

/**
 * Returns the job-title label for display (e.g. "Assistant Manager", "Manager", "Sales").
 * For EMPLOYEE role, uses position label when provided (Sales, Senior Sales, Boutique Manager, Assistant Manager).
 */
export function getRoleDisplayLabel(
  role: Role,
  position?: EmployeePosition | null,
  t?: TranslateFn
): string {
  const translate = t ?? ((k: string) => k);
  if (role === 'EMPLOYEE' && position && position in POSITION_KEYS) {
    return translate(POSITION_KEYS[position as EmployeePosition]);
  }
  return translate(ROLE_KEYS[role]);
}
