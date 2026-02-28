/**
 * Sidebar navigation: grouped structure (OPERATIONS, EXECUTIVE, SALES, LEAVES, PLANNER_SYNC, ADMINISTRATION, KPI, HELP).
 * Single source of truth for nav items; RBAC and schedule permissions applied in getNavGroupsForUser / getNavLinksForUser.
 */

import type { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { canEditSchedule as canEditScheduleRbac, canApproveWeek as canApproveWeekRbac } from '@/lib/rbac/schedulePermissions';
import { FEATURES } from '@/lib/featureFlags';

export type NavItem = { href: string; key: string; roles: Role[] };

export type NavGroup = { key: string; labelKey: string; items: NavItem[] };

/** Order: OPERATIONS → EXECUTIVE → SALES → LEAVES → PLANNER_SYNC → ADMINISTRATION → KPI → HELP */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'OPERATIONS',
    labelKey: 'nav.group.OPERATIONS',
    items: [
      { href: '/', key: 'nav.home', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/dashboard', key: 'nav.dashboard', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/employee', key: 'nav.employeeHome', roles: ['EMPLOYEE', 'ASSISTANT_MANAGER'] },
      { href: '/schedule/view', key: 'nav.scheduleView', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/schedule/edit', key: 'nav.scheduleEditor', roles: ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/schedule/editor', key: 'nav.scheduleEditorDay', roles: ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/schedule/audit', key: 'nav.scheduleAudit', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/schedule/audit-edits', key: 'schedule.auditEditsTitle', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/approvals', key: 'nav.approvals', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/tasks', key: 'nav.tasks', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/tasks/monitor', key: 'tasks.monitorNav', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/tasks/setup', key: 'tasks.setup', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/inventory/daily', key: 'nav.inventoryDaily', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/inventory/daily/history', key: 'nav.inventoryDailyHistory', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/inventory/zones', key: 'nav.inventoryZones', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/inventory/follow-up', key: 'nav.inventoryFollowUp', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/boutique/tasks', key: 'nav.boutiqueTasks', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    ],
  },
  {
    key: 'EXECUTIVE',
    labelKey: 'nav.group.EXECUTIVE',
    items: [
      /* Primary: single-page modern view; must open /executive. */
      { href: '/executive', key: 'nav.executive', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
      { href: '/executive/insights', key: 'nav.executiveInsights', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
      { href: '/executive/compare', key: 'nav.executiveCompare', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
      { href: '/executive/employees', key: 'nav.executiveEmployees', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
      { href: '/executive/monthly', key: 'nav.executiveMonthly', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
    ],
  },
  {
    key: 'SALES',
    labelKey: 'nav.group.SALES',
    items: [
      { href: '/sales/my', key: 'nav.salesMy', roles: ['EMPLOYEE'] },
      { href: '/sales/summary', key: 'nav.salesSummary', roles: ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/sales/returns', key: 'nav.salesReturns', roles: ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/import/sales', key: 'nav.salesImport', roles: ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/sales/leadership-impact', key: 'nav.sales.leadershipImpact', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/targets', key: 'nav.targets', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/sales-edit-requests', key: 'nav.salesEditRequests', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/me/target', key: 'nav.myTarget', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    ],
  },
  {
    key: 'LEAVES',
    labelKey: 'nav.group.LEAVES',
    items: [
      { href: '/leaves/requests', key: 'nav.myLeaves', roles: ['EMPLOYEE', 'ASSISTANT_MANAGER'] },
      { href: '/leaves', key: 'nav.leaves', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/boutique/leaves', key: 'nav.boutiqueLeaves', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    ],
  },
  {
    key: 'PLANNER_SYNC',
    labelKey: 'nav.group.PLANNER_SYNC',
    items: [
      { href: '/planner-export', key: 'nav.export', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/sync/planner', key: 'nav.syncPlanner', roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    ],
  },
  {
    key: 'ADMINISTRATION',
    labelKey: 'nav.group.ADMINISTRATION',
    items: [
      { href: '/admin/administration', key: 'nav.admin.administrationDashboard', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/administration/users', key: 'nav.admin.administrationUsers', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/administration/access', key: 'nav.admin.administrationAccess', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/administration/audit', key: 'nav.admin.administrationAudit', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/administration/settings', key: 'nav.admin.administrationSettings', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/administration/version', key: 'nav.admin.administrationVersion', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/boutiques', key: 'nav.admin.boutiques', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/regions', key: 'nav.admin.regions', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/boutique-groups', key: 'nav.admin.boutiqueGroups', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/control-panel/delegation', key: 'nav.admin.delegation', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
      { href: '/admin/employees', key: 'nav.admin.employees', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
      { href: '/admin/reset-emp-id', key: 'nav.admin.resetEmpId', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/reset-password', key: 'nav.admin.resetPassword', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/coverage-rules', key: 'nav.admin.coverageRules', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/kpi-templates', key: 'nav.admin.kpiTemplates', roles: ['ADMIN', 'SUPER_ADMIN'] },
    ],
  },
  {
    key: 'IMPORT',
    labelKey: 'nav.group.IMPORT',
    items: [
      { href: '/admin/import', key: 'nav.admin.importDashboard', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/import/sales', key: 'nav.admin.importSales', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/import/monthly-snapshot', key: 'nav.admin.monthSnapshot', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/import/historical', key: 'nav.admin.historicalImport', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/import/issues', key: 'nav.admin.importIssues', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/import/monthly-matrix', key: 'nav.admin.importMonthlyMatrix', roles: ['ADMIN', 'SUPER_ADMIN'] },
    ],
  },
  {
    key: 'KPI',
    labelKey: 'nav.group.KPI',
    items: [
      { href: '/kpi/upload', key: 'nav.kpiUpload', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
    ],
  },
  {
    key: 'HELP',
    labelKey: 'nav.group.HELP',
    items: [
      { href: '/about', key: 'nav.about', roles: ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    ],
  },
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

/** Returns groups with only visible items; groups with no items are omitted. EXECUTIVE group hidden when FEATURES.EXECUTIVE is false. */
export function getNavGroupsForUser(
  user: Pick<User, 'role' | 'canEditSchedule'> & { canApproveWeek?: boolean }
): Array<NavGroup & { items: NavItem[] }> {
  const groups = NAV_GROUPS.filter((g) => g.key !== 'EXECUTIVE' || FEATURES.EXECUTIVE);
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => itemVisible(user, item)),
    }))
    .filter((g) => g.items.length > 0);
}

/** Flat list of all visible nav items (for mobile drawer / backward compat). */
export function getNavLinksForUser(
  user: Pick<User, 'role' | 'canEditSchedule'> & { canApproveWeek?: boolean }
): NavItem[] {
  return getNavGroupsForUser(user).flatMap((g) => g.items);
}

/** Flat list by role only (no schedule permission filter). Used by MobileBottomNav. EXECUTIVE items hidden when FEATURES.EXECUTIVE is false. */
export function getNavLinksForRole(role: Role): NavItem[] {
  const groups = NAV_GROUPS.filter((g) => g.key !== 'EXECUTIVE' || FEATURES.EXECUTIVE);
  return groups.flatMap((g) => g.items).filter((item) => item.roles.includes(role));
}
