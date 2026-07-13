/**
 * Central boutique authorization policy.
 *
 * Boutique IDs from requests are identifiers to validate, never authority.
 * Authority comes from the server session, active boutique row, membership,
 * and permission flags stored in PostgreSQL.
 */

import { prisma } from '@/lib/db';
import type { MembershipPermission } from '@/lib/membershipPermissions';
import type { Role } from '@prisma/client';

export type BoutiqueAccessUser = {
  id: string;
  role: Role;
  boutiqueId?: string | null;
  isPlatformOwner?: boolean;
  disabled?: boolean;
};

export type BoutiqueAccessResult =
  | { allowed: true; source: 'PLATFORM_OWNER' | 'SUPER_ADMIN' | 'ADMIN' | 'MEMBERSHIP' | 'SESSION_COMPAT' }
  | { allowed: false; reason: 'DISABLED' | 'DEMO_READ_ONLY' | 'BOUTIQUE_INACTIVE' | 'NO_ACCESS' | 'MISSING_PERMISSION' };

export type BoutiqueAccessDenialReason = Extract<
  BoutiqueAccessResult,
  { allowed: false }
>['reason'];

export class BoutiqueAuthorizationError extends Error {
  readonly code = 'FORBIDDEN';

  constructor(public readonly reason: BoutiqueAccessDenialReason) {
    super(reason);
    this.name = 'BoutiqueAuthorizationError';
  }
}

/** Platform-wide access is explicit and still requires an active boutique. */
export function hasExplicitPlatformAccess(user: BoutiqueAccessUser): boolean {
  return user.isPlatformOwner === true || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
}

/** Roles that may bypass single-boutique resource checks when policy allows. */
export function hasCrossBoutiqueAdminBypass(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function checkBoutiqueAccess(
  user: BoutiqueAccessUser,
  boutiqueId: string
): Promise<BoutiqueAccessResult> {
  if (user.disabled) return { allowed: false, reason: 'DISABLED' };

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { isActive: true },
  });
  if (!boutique?.isActive) return { allowed: false, reason: 'BOUTIQUE_INACTIVE' };

  if (user.isPlatformOwner) return { allowed: true, source: 'PLATFORM_OWNER' };
  if (user.role === 'SUPER_ADMIN') return { allowed: true, source: 'SUPER_ADMIN' };
  if (user.role === 'ADMIN') return { allowed: true, source: 'ADMIN' };

  const membership = await prisma.userBoutiqueMembership.findUnique({
    where: { userId_boutiqueId: { userId: user.id, boutiqueId } },
    select: { canAccess: true },
  });
  if (membership) {
    return membership.canAccess
      ? { allowed: true, source: 'MEMBERSHIP' }
      : { allowed: false, reason: 'NO_ACCESS' };
  }

  // Legacy compatibility for accounts created before memberships were backfilled.
  // A present membership with canAccess=false always wins and denies access.
  if (user.boutiqueId === boutiqueId) {
    return { allowed: true, source: 'SESSION_COMPAT' };
  }
  return { allowed: false, reason: 'NO_ACCESS' };
}

export async function requireBoutiqueAccess(
  user: BoutiqueAccessUser,
  boutiqueId: string
): Promise<BoutiqueAccessResult & { allowed: true }> {
  const result = await checkBoutiqueAccess(user, boutiqueId);
  if (!result.allowed) throw new BoutiqueAuthorizationError(result.reason);
  return result;
}

export async function checkBoutiquePermission(
  user: BoutiqueAccessUser,
  boutiqueId: string,
  permission: MembershipPermission
): Promise<BoutiqueAccessResult> {
  const access = await checkBoutiqueAccess(user, boutiqueId);
  if (!access.allowed) return access;

  if (hasExplicitPlatformAccess(user)) return access;
  if (user.role !== 'MANAGER' && user.role !== 'AREA_MANAGER') {
    return { allowed: false, reason: 'MISSING_PERMISSION' };
  }

  const membership = await prisma.userBoutiqueMembership.findUnique({
    where: { userId_boutiqueId: { userId: user.id, boutiqueId } },
    select: {
      canAccess: true,
      canManageTasks: true,
      canManageLeaves: true,
      canManageSales: true,
      canManageInventory: true,
    },
  });
  if (!membership?.canAccess || !membership[permission]) {
    return { allowed: false, reason: 'MISSING_PERMISSION' };
  }
  return { allowed: true, source: 'MEMBERSHIP' };
}

export async function requireBoutiquePermission(
  user: BoutiqueAccessUser,
  boutiqueId: string,
  permission: MembershipPermission
): Promise<BoutiqueAccessResult & { allowed: true }> {
  const result = await checkBoutiquePermission(user, boutiqueId, permission);
  if (!result.allowed) throw new BoutiqueAuthorizationError(result.reason);
  return result;
}
