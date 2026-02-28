/**
 * Boutique-scoped permission checks. Server-side only.
 * ADMIN: implicit full permissions (no membership flags needed).
 * MANAGER: gated by UserBoutiqueMembership flags (canManageTasks, canManageLeaves, canManageSales, canManageInventory).
 */

import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export type MembershipPermission = 'canManageTasks' | 'canManageLeaves' | 'canManageSales' | 'canManageInventory';

/** Get membership for user + boutique; returns null if not found. */
export async function getMembership(userId: string, boutiqueId: string) {
  return prisma.userBoutiqueMembership.findUnique({
    where: { userId_boutiqueId: { userId, boutiqueId } },
  });
}

/** ADMIN and SUPER_ADMIN have full permissions. MANAGER needs membership flag for that boutique. */
export async function canManageInBoutique(
  userId: string,
  userRole: Role,
  boutiqueId: string,
  permission: MembershipPermission
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') return true;
  if (userRole !== 'MANAGER') return false;
  const m = await getMembership(userId, boutiqueId);
  if (!m?.canAccess) return false;
  return Boolean(m[permission]);
}

/** Check if user can manage tasks in at least one of the given boutique IDs. */
export async function canManageTasksInAny(
  userId: string,
  userRole: Role,
  boutiqueIds: string[]
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') return true;
  if (userRole !== 'MANAGER' || boutiqueIds.length === 0) return false;
  const memberships = await prisma.userBoutiqueMembership.findMany({
    where: { userId, boutiqueId: { in: boutiqueIds }, canAccess: true, canManageTasks: true },
  });
  return memberships.length > 0;
}

/** Check if user can manage leaves in this boutique. */
export async function canManageLeavesInBoutique(
  userId: string,
  userRole: Role,
  boutiqueId: string
): Promise<boolean> {
  return canManageInBoutique(userId, userRole, boutiqueId, 'canManageLeaves');
}

/** Check if user can manage sales in this boutique. */
export async function canManageSalesInBoutique(
  userId: string,
  userRole: Role,
  boutiqueId: string
): Promise<boolean> {
  return canManageInBoutique(userId, userRole, boutiqueId, 'canManageSales');
}
