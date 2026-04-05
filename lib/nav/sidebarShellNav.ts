/**
 * App shell navigation — maps `APP_SHELL_*` from `navConfig.ts` to rendered links.
 * Desktop sidebar and mobile drawer both use this module only (no flat legacy menu).
 */

import type { Role } from '@prisma/client';
import {
  APP_SHELL_ENTRY_DAILY,
  APP_SHELL_ENTRY_DAILY_ROLES,
  APP_SHELL_HUB_SECTIONS,
  APP_SHELL_QUICK_ACCESS,
} from '@/lib/navConfig';
import { canAccessRoute } from '@/lib/permissions';

export const ENTRY_DAILY_SALES_SIDEBAR_ROLES = APP_SHELL_ENTRY_DAILY_ROLES;

export type SidebarShellLink = { key: string; label: string; href: string };

export function getSidebarQuickAccess(role: Role, t: (key: string) => string): SidebarShellLink[] {
  const items: SidebarShellLink[] = [];
  for (const row of APP_SHELL_QUICK_ACCESS) {
    if (row.requiresRouteAccess && !canAccessRoute(role, row.href)) continue;
    items.push({ key: row.key, href: row.href, label: t(row.labelKey) });
  }
  return items;
}

export function getSidebarHubSections(t: (key: string) => string): SidebarShellLink[] {
  return APP_SHELL_HUB_SECTIONS.map((h) => ({
    key: h.key,
    href: h.href,
    label: t(h.labelKey),
  }));
}

export function getAppShellEntryDaily() {
  return APP_SHELL_ENTRY_DAILY;
}
