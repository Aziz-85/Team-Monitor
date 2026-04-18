/**
 * Route consistency guard (development only).
 *
 * - **navConfig** (`lib/navConfig.ts`): sidebar items, labels, and which roles see each link.
 * - **ROLE_ROUTES** (`lib/permissions.ts`): path prefixes each role may access (`canAccessRoute` / RouteGuard).
 *
 * These two sources can drift (e.g. a nav link added for MANAGER but `ROLE_ROUTES` not updated).
 * This module compares them and warns in development. It does **not** replace RBAC; a future
 * unified RBAC layer may merge nav + access. Production behavior is unchanged.
 */

import { canAccessRoute } from '@/lib/routeMatrix';
import type { Role } from '@/lib/routeMatrix';

/** Minimal shape to avoid circular imports with navConfig. */
export type NavGroupForConsistency = {
  key: string;
  items: Array<{ href: string; roles: Role[] }>;
};

/**
 * Intentional mismatches: nav lists a role for an href that ROLE_ROUTES does not cover yet,
 * or legacy exceptions. Prefer fixing ROLE_ROUTES/nav instead of growing this list.
 */
export const NAV_ROLE_DRIFT_ALLOWLIST: Array<{ href: string; role: Role; reason: string }> = [];

/**
 * Warns when a nav item declares a role that cannot access that href via `canAccessRoute`.
 * Run from `navConfig` after `NAV_GROUPS` is defined. Development only; never throws.
 */
export function checkNavAgainstRoleRoutes(navGroups: NavGroupForConsistency[]): void {
  if (process.env.NODE_ENV !== 'development') return;

  const allowed = (href: string, role: Role) =>
    NAV_ROLE_DRIFT_ALLOWLIST.some((a) => a.href === href && a.role === role);

  const warnings: string[] = [];
  for (const group of navGroups) {
    for (const it of group.items) {
      for (const role of it.roles) {
        if (allowed(it.href, role)) continue;
        if (!canAccessRoute(role, it.href)) {
          warnings.push(
            `[navConsistency] Group "${group.key}": nav href "${it.href}" includes role ${role} but ROLE_ROUTES/canAccessRoute does not grant access — fix drift or allowlist with reason.`
          );
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.warn(`[navConsistency] ${warnings.length} potential nav vs ROLE_ROUTES mismatch(es):\n${warnings.join('\n')}`);
  }
}
