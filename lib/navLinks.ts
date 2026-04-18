/**
 * Public entry for hub nav helpers. Import from here instead of `@/lib/permissions`
 * so `permissions` never statically depends on `navConfig` (avoids circular init with `navConsistency`).
 */
export { getNavLinksForUser, getNavLinksForRole, getNavGroupsForUser } from './navConfig';
export type { NavItem, NavGroup } from './navConfig';
