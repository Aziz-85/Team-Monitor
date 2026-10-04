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

export type SidebarShellLink = { key: string; label: string; href: string; tier?: 'hub' | 'page'; icon?: 'architecture'; children?: SidebarShellLink[] };
export type SidebarShellGroup = { key: string; label: string; items: SidebarShellLink[] };

type SidebarShellGroupedItem = { key: string; href: string; labelKey: string; tier?: 'hub' | 'page'; icon?: 'architecture'; children?: SidebarShellGroupedItem[] };
type SidebarShellGroupedSection = { key: string; labelKey: string; items: SidebarShellGroupedItem[] };

const SIDEBAR_GROUPS: SidebarShellGroupedSection[] = [
  {
    key: 'quick-access',
    labelKey: 'nav.sidebar.primary',
    items: [
      { key: 'HOME', href: '/', labelKey: 'nav.home', tier: 'hub' },
      { key: 'DASHBOARD', href: '/dashboard', labelKey: 'nav.dashboard', tier: 'page' },
      { key: 'EMPLOYEE_HOME', href: '/employee', labelKey: 'nav.employeeHome' },
      { key: 'ENTRY_DAILY', href: '/sales/daily', labelKey: 'nav.sidebar.entryDailySales', tier: 'page' },
    ],
  },
  {
    key: 'sections',
    labelKey: 'nav.sidebar.sections',
    items: [
      {
        key: 'TEAM_HUB', href: '/nav/team', labelKey: 'nav.sidebar.team', tier: 'hub',
        children: [
          { key: 'SCHEDULE_HUB', href: '/nav/team/schedule', labelKey: 'nav.sidebar.schedule' },
          { key: 'EMPLOYEES_HUB', href: '/nav/team/employees', labelKey: 'nav.admin.employees' },
          { key: 'LEAVES_HUB', href: '/nav/team/leaves', labelKey: 'nav.leaves' },
          { key: 'APPROVALS', href: '/approvals', labelKey: 'nav.approvals' },
          { key: 'COMPLIANCE', href: '/compliance', labelKey: 'nav.compliance' },
        ],
      },
      {
        key: 'OPERATIONS_HUB', href: '/nav/operations', labelKey: 'nav.sidebar.operations', tier: 'hub',
        children: [
          { key: 'TASKS_HUB', href: '/nav/operations/tasks', labelKey: 'nav.groups.tasks' },
          { key: 'INVENTORY_HUB', href: '/nav/operations/inventory', labelKey: 'nav.groups.inventory' },
          { key: 'SYNC_PLANNER', href: '/sync/planner', labelKey: 'nav.syncPlanner' },
        ],
      },
      {
        key: 'ANALYTICS_HUB', href: '/nav/analytics', labelKey: 'nav.sidebar.analytics', tier: 'hub',
        children: [
          { key: 'SALES_HUB', href: '/nav/analytics/sales', labelKey: 'nav.group.SALES' },
          { key: 'PERFORMANCE_INTELLIGENCE', href: '/analytics/performance-intelligence', labelKey: 'nav.analytics.performanceIntelligence' },
          { key: 'REPORTS_HUB', href: '/nav/analytics/reports', labelKey: 'nav.group.REPORTS' },
          { key: 'TARGETS_HUB', href: '/targets', labelKey: 'nav.reports.targetsManagement' },
          { key: 'COMPANY', href: '/company', labelKey: 'nav.group.COMPANY' },
        ],
      },
      {
        key: 'SYSTEM_HUB', href: '/nav/system', labelKey: 'nav.sidebar.system', tier: 'hub',
        children: [
          { key: 'ADMIN_HUB', href: '/nav/system/admin', labelKey: 'nav.admin.administrationDashboard' },
          { key: 'IMPORTS_HUB', href: '/nav/system/imports', labelKey: 'nav.admin.importDashboard' },
          { key: 'ARCHITECTURE_CONSOLE', href: '/architecture', labelKey: 'nav.architectureConsole', icon: 'architecture' },
          { key: 'SECURITY_SETTINGS', href: '/settings/security', labelKey: 'nav.securitySettings' },
        ],
      },
    ],
  },
];

const SECTION_ROUTE_PREFIXES: Array<{ href: string; prefixes: string[] }> = [
  {
    href: '/nav/team',
    prefixes: ['/nav/team', '/schedule', '/approvals', '/admin/employees', '/area/employees', '/area/targets', '/leaves', '/boutique/leaves', '/compliance', '/admin/control-panel/delegation'],
  },
  {
    href: '/nav/operations',
    prefixes: ['/nav/operations', '/tasks', '/boutique/tasks', '/inventory', '/sync/planner'],
  },
  {
    href: '/nav/analytics',
    prefixes: ['/nav/analytics', '/sales', '/reports', '/executive', '/performance', '/analytics', '/targets', '/company', '/kpi', '/me/target', '/admin/sales-edit-requests'],
  },
  {
    href: '/nav/system',
    prefixes: ['/nav/system', '/admin', '/architecture', '/settings', '/about', '/change-password'],
  },
];

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Resolves every product page to its single top-level navigation branch. */
export function getSidebarSectionHref(pathname: string): string | null {
  for (const section of SECTION_ROUTE_PREFIXES) {
    if (section.prefixes.some((prefix) => pathMatchesPrefix(pathname, prefix))) return section.href;
  }
  return null;
}

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
  const mapItem = (item: SidebarShellGroupedItem): SidebarShellLink | null => {
    if (!canAccessRoute(role, item.href)) return null;
    const children = item.children
      ?.map(mapItem)
      .filter((child): child is SidebarShellLink => child !== null);
    return {
      key: item.key,
      href: item.href,
      label: t(item.labelKey),
      tier: item.tier,
      icon: item.icon,
      children: children?.length ? children : undefined,
    };
  };

  return SIDEBAR_GROUPS.map((section) => {
    const items = section.items
      .map(mapItem)
      .filter((item): item is SidebarShellLink => item !== null);
    return { key: section.key, label: t(section.labelKey), items };
  }).filter((section) => section.items.length > 0);
}
