/**
 * Planner integration authorization.
 * Only ADMIN, SUPER_ADMIN can manage integrations.
 * Employees cannot access integration settings.
 * ADMIN: boutique-scoped (user.boutiqueId). SUPER_ADMIN: org-wide.
 */

import { getSessionUser } from '@/lib/auth';
import type { Role } from '@prisma/client';

const INTEGRATION_MANAGER_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export function canManagePlannerIntegration(role: Role): boolean {
  return INTEGRATION_MANAGER_ROLES.includes(role);
}

export type PlannerAccessResult = {
  userId: string;
  role: Role;
  /** For ADMIN: their boutiqueId. For SUPER_ADMIN: null (org-wide). */
  boutiqueId: string | null;
};

export async function requirePlannerIntegrationAccess(): Promise<PlannerAccessResult> {
  const user = await getSessionUser();
  if (!user?.id) {
    const e = new Error('Unauthorized') as Error & { code?: string };
    e.code = 'UNAUTHORIZED';
    throw e;
  }
  if (!canManagePlannerIntegration(user.role as Role)) {
    const e = new Error('Forbidden') as Error & { code?: string };
    e.code = 'FORBIDDEN';
    throw e;
  }
  const boutiqueId = user.role === 'SUPER_ADMIN' ? null : (user.boutiqueId ?? null);
  return { userId: user.id, role: user.role as Role, boutiqueId };
}
