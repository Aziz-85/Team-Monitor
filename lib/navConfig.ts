/**
 * Sidebar navigation: professional hierarchy (DASHBOARD, TEAM, SALES, TASKS, INVENTORY, REPORTS, SETTINGS, HELP).
 * Single source of truth for nav items; RBAC and schedule permissions applied in getNavGroupsForUser / getNavLinksForUser.
 * No routes removed; deep admin pages remain accessible under SETTINGS (canonical hrefs only).
 */

import type { Role } from '@/lib/permissions';
import type { User } from '@prisma/client';
import { canEditSchedule as canEditScheduleRbac, canApproveWeek as canApproveWeekRbac } from '@/lib/rbac/schedulePermissions';
import { FEATURES } from '@/lib/featureFlags';

export type NavItem = { href: string; key: string; roles: Role[] };

export type NavGroup = { key: string; labelKey: string; items: NavItem[] };

/** 1. DASHBOARD — Home, Dashboard, Employee Home */
const GROUP_DASHBOARD: NavGroup = {
  key: 'DASHBOARD',
  labelKey: 'nav.group.DASHBOARD',
  items: [
    { href: '/', key: 'nav.home', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/dashboard', key: 'nav.dashboard', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DEMO_VIEWER'] },
    { href: '/employee', key: 'nav.employeeHome', roles: ['EMPLOYEE', 'ASSISTANT_MANAGER'] },
  ],
};

/** 2. TEAM — Schedule, Approvals, Employees, Area, Leaves, Delegation, Access */
const GROUP_TEAM: NavGroup = {
  key: 'TEAM',
  labelKey: 'nav.group.TEAM',
  items: [
    { href: '/schedule/view', key: 'nav.scheduleView', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DEMO_VIEWER'] },
    { href: '/schedule/edit', key: 'nav.scheduleEditor', roles: ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/schedule/editor', key: 'nav.scheduleEditorDay', roles: ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/schedule/audit', key: 'nav.scheduleAudit', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/schedule/audit-edits', key: 'schedule.auditEditsTitle', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/approvals', key: 'nav.approvals', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/admin/employees', key: 'nav.admin.employees', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/area/employees', key: 'nav.area.employees', roles: ['AREA_MANAGER', 'SUPER_ADMIN'] },
    { href: '/area/targets', key: 'nav.area.targets', roles: ['AREA_MANAGER', 'SUPER_ADMIN'] },
    { href: '/leaves/requests', key: 'nav.myLeaves', roles: ['EMPLOYEE', 'ASSISTANT_MANAGER'] },
    { href: '/leaves', key: 'nav.leaves', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/boutique/leaves', key: 'nav.boutiqueLeaves', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/admin/control-panel/delegation', key: 'nav.admin.delegation', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
    { href: '/admin/memberships', key: 'nav.admin.memberships', roles: ['ADMIN', 'SUPER_ADMIN'] },
  ],
};

/** 3. SALES — My Sales, Returns, Import, Leadership, Edit Requests, My Target, KPI (report links under REPORTS) */
const GROUP_SALES: NavGroup = {
  key: 'SALES',
  labelKey: 'nav.group.SALES',
  items: [
    { href: '/sales/my', key: 'nav.salesMy', roles: ['EMPLOYEE'] },
    { href: '/sales/returns', key: 'nav.salesReturns', roles: ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/import/sales', key: 'nav.salesImport', roles: ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/sales/leadership-impact', key: 'nav.sales.leadershipImpact', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/sales-edit-requests', key: 'nav.salesEditRequests', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/me/target', key: 'nav.myTarget', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/kpi/upload', key: 'nav.kpiUpload', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
  ],
};

/** 4. TASKS — Tasks, Monitor, Setup, Boutique tasks */
const GROUP_TASKS: NavGroup = {
  key: 'TASKS',
  labelKey: 'nav.group.TASKS',
  items: [
    { href: '/tasks', key: 'nav.tasks', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/tasks/monitor', key: 'tasks.monitorNav', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/tasks/setup', key: 'tasks.setup', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/boutique/tasks', key: 'nav.boutiqueTasks', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
  ],
};

/** 5. INVENTORY — Daily, History, Zones, Follow-up */
const GROUP_INVENTORY: NavGroup = {
  key: 'INVENTORY',
  labelKey: 'nav.group.INVENTORY',
  items: [
    { href: '/inventory/daily', key: 'nav.inventoryDaily', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/inventory/daily/history', key: 'nav.inventoryDailyHistory', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/inventory/zones', key: 'nav.inventoryZones', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/inventory/follow-up', key: 'nav.inventoryFollowUp', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
  ],
};

/** 6. REPORTS — Performance overview, Monthly, Summary, Targets, Daily ledger, Insights, Compare, Team (filtered by FEATURES.EXECUTIVE for /executive*) */
const GROUP_REPORTS: NavGroup = {
  key: 'REPORTS',
  labelKey: 'nav.group.REPORTS',
  items: [
    { href: '/executive', key: 'nav.reports.performanceOverview', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'] },
    { href: '/executive/monthly', key: 'nav.reports.monthlyPerformance', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'] },
    { href: '/sales/summary', key: 'nav.reports.salesSummary', roles: ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/admin/targets', key: 'nav.reports.targets', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/targets', key: 'nav.reports.targetsManagement', roles: ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/sales/daily', key: 'nav.reports.dailyLedger', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] },
    { href: '/executive/insights', key: 'nav.reports.insights', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'] },
    { href: '/executive/compare', key: 'nav.reports.compareBranches', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'] },
    { href: '/executive/employees', key: 'nav.reports.teamPerformance', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'] },
  ],
};

/** 7. SETTINGS — Administration (canonical routes only) */
const GROUP_SETTINGS: NavGroup = {
  key: 'SETTINGS',
  labelKey: 'nav.group.SETTINGS',
  items: [
    { href: '/admin/administration', key: 'nav.admin.administrationDashboard', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/users', key: 'nav.admin.administrationUsers', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/audit/login', key: 'nav.admin.administrationAudit', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/system', key: 'nav.admin.administrationSettings', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/system/version', key: 'nav.admin.administrationVersion', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/boutiques', key: 'nav.admin.boutiques', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/regions', key: 'nav.admin.regions', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/boutique-groups', key: 'nav.admin.boutiqueGroups', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/coverage-rules', key: 'nav.admin.coverageRules', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/kpi-templates', key: 'nav.admin.kpiTemplates', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/reset-emp-id', key: 'nav.admin.resetEmpId', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/reset-password', key: 'nav.admin.resetPassword', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/sync/planner', key: 'nav.syncPlanner', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/import', key: 'nav.admin.importDashboard', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/import/monthly-snapshot', key: 'nav.admin.monthSnapshot', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/import/historical', key: 'nav.admin.historicalImport', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/import/issues', key: 'nav.admin.importIssues', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { href: '/admin/import/monthly-matrix', key: 'nav.admin.importMonthlyMatrix', roles: ['ADMIN', 'SUPER_ADMIN'] },
  ],
};

/** 8. HELP — About (single item; kept at end) */
const GROUP_HELP: NavGroup = {
  key: 'HELP',
  labelKey: 'nav.group.HELP',
  items: [
    { href: '/about', key: 'nav.about', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER', 'DEMO_VIEWER'] },
  ],
};

/** Ordered groups. REPORTS hides Executive items when FEATURES.EXECUTIVE is false. */
export const NAV_GROUPS: NavGroup[] = [
  GROUP_DASHBOARD,
  GROUP_TEAM,
  GROUP_SALES,
  GROUP_TASKS,
  GROUP_INVENTORY,
  GROUP_REPORTS,
  GROUP_SETTINGS,
  GROUP_HELP,
];

function itemVisible(
  user: Pick<User, 'role' | 'canEditSchedule'> & { canApproveWeek?: boolean },
  item: NavItem
): boolean {
  if (!item.roles.includes(user.role)) return false;
  if (item.href === '/schedule/edit' || item.href === '/schedule/editor') return canEditScheduleRbac(user);
  if (item.href === '/approvals') return (user.canApproveWeek ?? canApproveWeekRbac(user));
  return true;
}

/** Filter REPORTS group: remove Executive items when FEATURES.EXECUTIVE is false. */
function filterPerformanceItems(items: NavItem[]): NavItem[] {
  if (FEATURES.EXECUTIVE) return items;
  return items.filter((item) => !item.href.startsWith('/executive'));
}

/** Returns groups with only visible items; groups with no items are omitted. */
export function getNavGroupsForUser(
  user: Pick<User, 'role' | 'canEditSchedule'> & { canApproveWeek?: boolean }
): Array<NavGroup & { items: NavItem[] }> {
  return NAV_GROUPS.map((group) => {
    let items = group.items;
    if (group.key === 'REPORTS') items = filterPerformanceItems(items);
    return {
      ...group,
      items: items.filter((item) => itemVisible(user, item)),
    };
  }).filter((g) => g.items.length > 0);
}

/** Flat list of all visible nav items (for mobile drawer / backward compat). */
export function getNavLinksForUser(
  user: Pick<User, 'role' | 'canEditSchedule'> & { canApproveWeek?: boolean }
): NavItem[] {
  return getNavGroupsForUser(user).flatMap((g) => g.items);
}

/** Flat list by role only (no schedule permission filter). Used by MobileBottomNav. */
export function getNavLinksForRole(role: Role): NavItem[] {
  const withExecutive = FEATURES.EXECUTIVE;
  return NAV_GROUPS.flatMap((g) => {
    let items = g.items;
    if (g.key === 'REPORTS' && !withExecutive) items = filterPerformanceItems(items);
    return items.filter((item) => item.roles.includes(role));
  });
}
