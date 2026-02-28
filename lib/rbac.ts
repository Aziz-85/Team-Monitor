/**
 * RBAC enforcement utilities (Sprint 1).
 * Centralized role checks for consistent enforcement across all mutation routes.
 */

import { requireRole, requireSession, type SessionUser } from '@/lib/auth';
import type { Role } from '@prisma/client';

/**
 * Require user to have one of the allowed roles.
 * Throws AuthError with code UNAUTHORIZED or FORBIDDEN.
 */
export async function requireRoleCheck(roles: Role[]): Promise<SessionUser> {
  return requireRole(roles);
}

/** True if role has full admin privileges (all boutiques when SUPER_ADMIN). */
export function isAdminOrSuperAdmin(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/**
 * Assert user can edit schedule (MANAGER, ASSISTANT_MANAGER, ADMIN, SUPER_ADMIN).
 * Throws AuthError if not authorized.
 */
export async function assertCanEditSchedule(): Promise<SessionUser> {
  return requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN']);
}

/**
 * Assert user can edit inventory (all authenticated users can complete own, MANAGER+ can do more).
 * For now, any authenticated user can complete inventory.
 * Throws AuthError if not authenticated.
 */
export async function assertCanEditInventory(): Promise<SessionUser> {
  return requireSession();
}

/**
 * Assert user can admin locks (MANAGER, ADMIN).
 * ASSISTANT_MANAGER can lock/unlock days but not weeks.
 * Throws AuthError if not authorized.
 */
export async function assertCanAdminLocks(): Promise<SessionUser> {
  return requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']);
}

/**
 * Assert user can lock/unlock days (ASSISTANT_MANAGER, MANAGER, ADMIN).
 * Throws AuthError if not authorized.
 */
export async function assertCanLockUnlockDay(): Promise<SessionUser> {
  return requireRole(['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN']);
}

/**
 * Assert user can lock/unlock weeks (ADMIN only).
 * Throws AuthError if not authorized.
 */
export async function assertCanLockUnlockWeek(): Promise<SessionUser> {
  return requireRole(['ADMIN']);
}
