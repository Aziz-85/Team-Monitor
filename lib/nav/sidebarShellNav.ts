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

export type SidebarShellLink = { key: string; label: string; href: string; tier?: 'hub' | 'page'; icon?: 'architecture' };
export type SidebarShellGroup = { key: string; label: string; items: SidebarShellLink[] };

type SidebarShellGroupedItem = { key: string; href: string; labelKey: string; tier?: 'hub' | 'page'; icon?: 'architecture' };
type SidebarShellGroupedSection = { key: string; labelKey: string; items: SidebarShellGroupedItem[] };

const SIDEBAR_GROUPS: SidebarShellGroupedSection[] = [
  {
    key: 'home',
    labelKey: 'nav.groups.home',
    items: [
      { key: 'HOME', href: '/', labelKey: 'nav.home', tier: 'hub' },
      { key: 'DASHBOARD', href: '/dashboard', labelKey: 'nav.dashboard', tier: 'page' },
      { key: 'EMPLOYEE_HOME', href: '/employee', labelKey: 'nav.employeeHome' },
    ],
  },
  {
    key: 'team',
    labelKey: 'nav.sidebar.team',
    items: [
      { key: 'TEAM_HUB', href: '/nav/team', labelKey: 'nav.sidebar.overview', tier: 'hub' },
      { key: 'SCHEDULE_HUB', href: '/nav/team/schedule', labelKey: 'nav.sidebar.schedule', tier: 'page' },
      { key: 'EMPLOYEES_HUB', href: '/nav/team/employees', labelKey: 'nav.admin.employees', tier: 'page' },
      { key: 'LEAVES_HUB', href: '/nav/team/leaves', labelKey: 'nav.leaves', tier: 'page' },
      { key: 'APPROVALS', href: '/approvals', labelKey: 'nav.approvals' },
      { key: 'COMPLIANCE', href: '/compliance', labelKey: 'nav.compliance' },
    ],
  },
  {
    key: 'operations',
    labelKey: 'nav.sidebar.operations',
    items: [
      { key: 'OPERATIONS_HUB', href: '/nav/operations', labelKey: 'nav.sidebar.overview', tier: 'hub' },
      { key: 'TASKS_HUB', href: '/nav/operations/tasks', labelKey: 'nav.groups.tasks', tier: 'page' },
      { key: 'INVENTORY_HUB', href: '/nav/operations/inventory', labelKey: 'nav.groups.inventory', tier: 'page' },
    ],
  },
  {
    key: 'analytics',
    labelKey: 'nav.sidebar.analytics',
    items: [
      { key: 'ANALYTICS_HUB', href: '/nav/analytics', labelKey: 'nav.sidebar.overview', tier: 'hub' },
      { key: 'SALES_HUB', href: '/nav/analytics/sales', labelKey: 'nav.group.SALES', tier: 'page' },
      { key: 'REPORTS_HUB', href: '/nav/analytics/reports', labelKey: 'nav.group.REPORTS', tier: 'page' },
      { key: 'PERFORMANCE_INTELLIGENCE', href: '/analytics/performance-intelligence', labelKey: 'nav.analytics.performanceIntelligence' },
      { key: 'TARGETS_HUB', href: '/targets', labelKey: 'nav.reports.targetsManagement' },
    ],
  },
  {
    key: 'system',
    labelKey: 'nav.sidebar.system',
    items: [
      { key: 'SYSTEM_HUB', href: '/nav/system', labelKey: 'nav.sidebar.overview', tier: 'hub' },
      { key: 'ADMIN_HUB', href: '/nav/system/admin', labelKey: 'nav.admin.administrationDashboard', tier: 'page' },
      { key: 'IMPORTS_HUB', href: '/nav/system/imports', labelKey: 'nav.admin.importDashboard', tier: 'page' },
      { key: 'ARCHITECTURE_CONSOLE', href: '/architecture', labelKey: 'nav.architectureConsole', icon: 'architecture' },
      { key: 'SECURITY_SETTINGS', href: '/settings/security', labelKey: 'nav.securitySettings' },
    ],
  },
];

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

export function getSidebarGroupedSections(role: Role, t: (key: string) => string): SidebarShellGroup[] {
  return SIDEBAR_GROUPS.map((section) => {
    const items = section.items
      .filter((item) => canAccessRoute(role, item.href))
      .map((item) => ({
        key: item.key,
        href: item.href,
        label: t(item.labelKey),
        tier: item.tier,
        icon: item.icon,
      }));
    return { key: section.key, label: t(section.labelKey), items };
  }).filter((section) => section.items.length > 0);
}
