/**
 * Planner integration authorization.
 * ADMIN, SUPER_ADMIN, AREA_MANAGER can manage integrations.
 * ADMIN: boutique-scoped (user.boutiqueId). AREA_MANAGER: area boutiques. SUPER_ADMIN: org-wide.
 */

import { getSessionUser } from '@/lib/auth';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

const INTEGRATION_MANAGER_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export function canManagePlannerIntegration(role: Role): boolean {
  return INTEGRATION_MANAGER_ROLES.includes(role);
}

export type PlannerAccessResult = {
  userId: string;
  role: Role;
  /** For ADMIN: their boutiqueId. For SUPER_ADMIN: null (org-wide). For AREA_MANAGER: null, use boutiqueIds. */
  boutiqueId: string | null;
  /** For AREA_MANAGER: allowed boutique IDs. For others: undefined. */
  boutiqueIds?: string[];
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
  if (user.role === 'SUPER_ADMIN') {
    return { userId: user.id, role: user.role as Role, boutiqueId: null };
  }
  if (user.role === 'AREA_MANAGER') {
    const boutiqueIds = await getUserAllowedBoutiqueIds(user.id);
    return { userId: user.id, role: user.role as Role, boutiqueId: null, boutiqueIds };
  }
  return { userId: user.id, role: user.role as Role, boutiqueId: user.boutiqueId ?? null };
}
