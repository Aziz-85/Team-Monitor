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

export type SidebarShellLink = { key: string; label: string; href: string; icon?: 'architecture' };
export type SidebarShellGroup = { key: string; label: string; items: SidebarShellLink[] };

type SidebarShellGroupedItem = { key: string; href: string; labelKey: string; icon?: 'architecture' };
type SidebarShellGroupedSection = { key: string; labelKey: string; items: SidebarShellGroupedItem[] };

const SIDEBAR_GROUPS: SidebarShellGroupedSection[] = [
  {
    key: 'home',
    labelKey: 'nav.groups.home',
    items: [
      { key: 'HOME', href: '/', labelKey: 'nav.home' },
      { key: 'DASHBOARD', href: '/dashboard', labelKey: 'nav.dashboard' },
      { key: 'EMPLOYEE_HOME', href: '/employee', labelKey: 'nav.employeeHome' },
    ],
  },
  {
    key: 'schedule',
    labelKey: 'nav.groups.schedulePlanning',
    items: [
      { key: 'SCHEDULE_EDIT', href: '/schedule/edit', labelKey: 'nav.scheduleEditor' },
      { key: 'SCHEDULE_NEXT', href: '/schedule/next', labelKey: 'nav.scheduleNext' },
      { key: 'SCHEDULE_VIEW', href: '/schedule/view', labelKey: 'nav.scheduleView' },
      { key: 'SCHEDULE_AUDIT', href: '/schedule/audit', labelKey: 'nav.scheduleAudit' },
      { key: 'SCHEDULE_EXPORT', href: '/reports/export-center', labelKey: 'nav.reports.exportCenter' },
      { key: 'APPROVALS', href: '/approvals', labelKey: 'nav.approvals' },
    ],
  },
  {
    key: 'tasks',
    labelKey: 'nav.groups.tasks',
    items: [
      { key: 'TASKS', href: '/tasks', labelKey: 'nav.tasks' },
      { key: 'TASK_SETUP', href: '/tasks/setup', labelKey: 'tasks.setup' },
      { key: 'TASK_MONITOR', href: '/tasks/monitor', labelKey: 'tasks.monitorNav' },
    ],
  },
  {
    key: 'inventory',
    labelKey: 'nav.groups.inventory',
    items: [
      { key: 'INV_DAILY', href: '/inventory/daily', labelKey: 'nav.inventoryDaily' },
      { key: 'INV_HISTORY', href: '/inventory/daily/history', labelKey: 'nav.inventoryDailyHistory' },
      { key: 'INV_ZONES', href: '/inventory/zones', labelKey: 'nav.inventoryZones' },
      { key: 'INV_FOLLOW', href: '/inventory/follow-up', labelKey: 'nav.inventoryFollowUp' },
    ],
  },
  {
    key: 'analytics',
    labelKey: 'nav.groups.analytics',
    items: [
      { key: 'SALES_SUMMARY', href: '/sales/summary', labelKey: 'nav.analytics.salesSummary' },
      { key: 'SALES_ANALYTICS', href: '/sales/analytics', labelKey: 'nav.analytics.salesAnalytics' },
      { key: 'PERFORMANCE', href: '/performance', labelKey: 'nav.analytics.performance' },
      { key: 'EXECUTIVE', href: '/executive', labelKey: 'nav.analytics.executive' },
      { key: 'EXECUTIVE_MONTHLY', href: '/executive/monthly', labelKey: 'nav.analytics.executiveMonthly' },
      { key: 'EXECUTIVE_INSIGHTS', href: '/executive/insights', labelKey: 'nav.analytics.executiveInsights' },
      { key: 'ADMIN_TARGETS', href: '/admin/targets', labelKey: 'nav.analytics.targets' },
    ],
  },
  {
    key: 'reports',
    labelKey: 'nav.groups.reports',
    items: [
      { key: 'EXPORT_CENTER', href: '/reports/export-center', labelKey: 'nav.reports.exportCenter' },
      { key: 'WEEKLY_REPORT', href: '/reports/weekly', labelKey: 'nav.reports.weeklyReport' },
      { key: 'STORE_REPORT', href: '/reports/store', labelKey: 'nav.reports.storePerformance' },
    ],
  },
  {
    key: 'team',
    labelKey: 'nav.groups.team',
    items: [
      { key: 'ADMIN_EMPLOYEES', href: '/admin/employees', labelKey: 'nav.admin.employees' },
      { key: 'LEAVES', href: '/leaves', labelKey: 'nav.leaves' },
      { key: 'ADMIN_USERS', href: '/admin/users', labelKey: 'nav.admin.users' },
    ],
  },
  {
    key: 'system',
    labelKey: 'nav.groups.system',
    items: [
      { key: 'BOUTIQUE_CONFIGURATION', href: '/admin/boutique-configuration', labelKey: 'nav.admin.boutiqueConfiguration' },
      { key: 'ADMIN_IMPORT', href: '/admin/import', labelKey: 'nav.admin.importDashboard' },
      { key: 'SYNC_PLANNER', href: '/sync/planner', labelKey: 'nav.syncPlanner' },
      { key: 'CHANGE_PASSWORD', href: '/change-password', labelKey: 'nav.changePassword' },
      { key: 'ARCHITECTURE_CONSOLE', href: '/architecture', labelKey: 'nav.architectureConsole', icon: 'architecture' },
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
        icon: item.icon,
      }));
    return { key: section.key, label: t(section.labelKey), items };
  }).filter((section) => section.items.length > 0);
}
