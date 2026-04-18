import type { Role } from '@/lib/routeMatrix';

export type { Role } from '@/lib/routeMatrix';
export { ROLE_ROUTES, canAccessRoute, getPostLoginPath } from '@/lib/routeMatrix';

/** Roles that can edit schedule (batch save) and access /schedule/edit */
export const SCHEDULE_EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

// --- Phase F: Lock & approval (by role only, no DB) ---
export function canLockUnlockDay(role: Role): boolean {
  return role === 'ASSISTANT_MANAGER' || role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}
/** Sprint 1: Lock Week = Admin / Super Admin only */
export function canLockWeek(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}
export function canUnlockWeek(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}
export function canApproveWeek(role: Role): boolean {
  return role === 'MANAGER' || role === 'AREA_MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/** Roles that can view full schedule grid (all rows) on /schedule/view */
export const SCHEDULE_VIEW_FULL_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export function canEditSchedule(role: Role): boolean {
  return SCHEDULE_EDIT_ROLES.includes(role);
}

export function canViewFullSchedule(role: Role): boolean {
  return SCHEDULE_VIEW_FULL_ROLES.includes(role);
}

/** Compliance / Expiry Tracker: view and manage (SUPER_ADMIN, ADMIN, AREA_MANAGER, MANAGER only). */
export const COMPLIANCE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER', 'MANAGER'];

export function canViewCompliance(role: Role): boolean {
  return COMPLIANCE_ROLES.includes(role);
}

export function canManageCompliance(role: Role): boolean {
  return COMPLIANCE_ROLES.includes(role);
}

/** Sprint 2B: MANAGER/ADMIN/SUPER_ADMIN auto-apply; ASSISTANT_MANAGER must go through approval. */
export function canAutoApprove(role: Role): boolean {
  return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function requiresApproval(role: Role): boolean {
  return role === 'ASSISTANT_MANAGER';
}

/** True if role is read-only demo (no edits, no admin, no export). */
export function isDemoViewer(role: Role): boolean {
  return role === 'DEMO_VIEWER';
}

/**
 * Nav link helpers (re-exported for legacy imports e.g. `ui-export`).
 * Implemented in `navLinks.ts` → `navConfig`; `navConsistency` must import `canAccessRoute` from `@/lib/routeMatrix` only.
 */
export { getNavLinksForUser, getNavLinksForRole } from '@/lib/navLinks';
