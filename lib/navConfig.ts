/**
 * Sidebar navigation: professional hierarchy with strict governance.
 * Single source of truth for nav items; RBAC and schedule permissions applied in getNavGroupsForUser / getNavLinksForUser.
 *
 * GOVERNANCE:
 * - Every nav item MUST have a type (NavType)
 * - LEGACY items MUST have hiddenFromNav = true
 * - UTILITY items MUST be in SYSTEM_ADMIN group
 * - CORE items must be in core groups (not admin groups)
 * - Validation runs in development; violations throw
 *
 * Structure:
 * - DASHBOARD, TEAM, SALES, TASKS, INVENTORY, REPORTS, HELP (core)
 * - ORGANIZATION, RULES_TEMPLATES, INTEGRATIONS, DATA_IMPORTS, SYSTEM_ADMIN (admin)
 */

import type { Role } from '@/lib/permissions';
import type { User } from '@prisma/client';
import { canEditSchedule as canEditScheduleRbac, canApproveWeek as canApproveWeekRbac } from '@/lib/rbac/schedulePermissions';
import { FEATURES } from '@/lib/featureFlags';
import { checkNavAgainstRoleRoutes } from '@/lib/navConsistency';

/** Strict classification for every nav item. Prevents unclassified additions. */
export type NavType =
  | 'CORE'
  | 'ORG'
  | 'RULE'
  | 'INTEGRATION'
  | 'DATA'
  | 'ADMIN'
  | 'UTILITY'
  | 'LEGACY';

/** Nav item with required type. hiddenFromNav excludes from sidebar (route still accessible). */
export type NavItem = {
  href: string;
  key: string;
  roles: Role[];
  type: NavType;
  hiddenFromNav?: boolean;
};

export type NavGroup = { key: string; labelKey: string; items: NavItem[] };

/** Helper to create nav items with type (enforces classification at compile time). */
function item(
  href: string,
  key: string,
  roles: Role[],
  type: NavType,
  hiddenFromNav?: boolean
): NavItem {
  return { href, key, roles, type, ...(hiddenFromNav && { hiddenFromNav }) };
}

/** 1. DASHBOARD — Home, Dashboard, Employee Home */
const GROUP_DASHBOARD: NavGroup = {
  key: 'DASHBOARD',
  labelKey: 'nav.group.DASHBOARD',
  items: [
    item('/', 'nav.home', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/dashboard', 'nav.dashboard', ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DEMO_VIEWER'], 'CORE'),
    item('/employee', 'nav.employeeHome', ['EMPLOYEE', 'ASSISTANT_MANAGER'], 'CORE'),
  ],
};

/** 2. TEAM — Schedule, Approvals, Employees, Area, Leaves, Delegation, Compliance */
const GROUP_TEAM: NavGroup = {
  key: 'TEAM',
  labelKey: 'nav.group.TEAM',
  items: [
    item('/schedule/view', 'nav.scheduleView', ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DEMO_VIEWER'], 'CORE'),
    item('/schedule/edit', 'nav.scheduleEditor', ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/schedule/editor', 'nav.scheduleEditorDay', ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/schedule/audit', 'nav.scheduleAudit', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/schedule/audit-edits', 'schedule.auditEditsTitle', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/approvals', 'nav.approvals', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/admin/employees', 'nav.admin.employees', ['ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/area/employees', 'nav.area.employees', ['AREA_MANAGER', 'SUPER_ADMIN'], 'CORE'),
    item('/area/targets', 'nav.area.targets', ['AREA_MANAGER', 'SUPER_ADMIN'], 'CORE'),
    item('/leaves/requests', 'nav.myLeaves', ['EMPLOYEE', 'ASSISTANT_MANAGER'], 'CORE'),
    item('/leaves', 'nav.leaves', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/boutique/leaves', 'nav.boutiqueLeaves', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/admin/control-panel/delegation', 'nav.admin.delegation', ['ADMIN', 'SUPER_ADMIN', 'MANAGER'], 'CORE'),
    item('/compliance', 'nav.compliance', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
  ],
};

/** 3. SALES — My Sales, Returns, Import, Leadership, Edit Requests, My Target, KPI */
const GROUP_SALES: NavGroup = {
  key: 'SALES',
  labelKey: 'nav.group.SALES',
  items: [
    item('/sales/my', 'nav.salesMy', ['EMPLOYEE'], 'CORE'),
    item('/sales/returns', 'nav.salesReturns', ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/admin/import/sales', 'nav.salesImport', ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/sales/leadership-impact', 'nav.sales.leadershipImpact', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/admin/sales-edit-requests', 'nav.salesEditRequests', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/me/target', 'nav.myTarget', ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/kpi/upload', 'nav.kpiUpload', ['ADMIN', 'SUPER_ADMIN', 'MANAGER'], 'CORE'),
  ],
};

/** 4. TASKS — Tasks, Monitor, Setup, Boutique tasks */
const GROUP_TASKS: NavGroup = {
  key: 'TASKS',
  labelKey: 'nav.group.TASKS',
  items: [
    item('/tasks', 'nav.tasks', ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/tasks/monitor', 'tasks.monitorNav', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/tasks/setup', 'tasks.setup', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/boutique/tasks', 'nav.boutiqueTasks', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
  ],
};

/** 5. INVENTORY — Daily, History, Zones, Follow-up */
const GROUP_INVENTORY: NavGroup = {
  key: 'INVENTORY',
  labelKey: 'nav.group.INVENTORY',
  items: [
    item('/inventory/daily', 'nav.inventoryDaily', ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/inventory/daily/history', 'nav.inventoryDailyHistory', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/inventory/zones', 'nav.inventoryZones', ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
    item('/inventory/follow-up', 'nav.inventoryFollowUp', ['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'CORE'),
  ],
};

/** 6. REPORTS — Performance overview, Monthly, Summary, Targets, Daily ledger, Insights, Compare, Team */
const GROUP_REPORTS: NavGroup = {
  key: 'REPORTS',
  labelKey: 'nav.group.REPORTS',
  items: [
    item('/executive', 'nav.reports.performanceOverview', ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'], 'CORE'),
    item('/executive/monthly', 'nav.reports.monthlyPerformance', ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'], 'CORE'),
    item('/sales/summary', 'nav.reports.salesSummary', ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/admin/targets', 'nav.reports.targets', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/targets', 'nav.reports.targetsManagement', ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/sales/daily', 'nav.reports.dailyLedger', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'CORE'),
    item('/executive/insights', 'nav.reports.insights', ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'], 'CORE'),
    item('/executive/compare', 'nav.reports.compareBranches', ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'], 'CORE'),
    item('/executive/employees', 'nav.reports.teamPerformance', ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AREA_MANAGER'], 'CORE'),
  ],
};

/** 7. ORGANIZATION — Boutiques, Regions, Boutique Groups, Users, Memberships */
const GROUP_ORGANIZATION: NavGroup = {
  key: 'ORGANIZATION',
  labelKey: 'nav.group.ORGANIZATION',
  items: [
    item('/admin/boutiques', 'nav.admin.boutiques', ['ADMIN', 'SUPER_ADMIN'], 'ORG'),
    item('/admin/regions', 'nav.admin.regions', ['ADMIN', 'SUPER_ADMIN'], 'ORG'),
    item('/admin/boutique-groups', 'nav.admin.boutiqueGroups', ['ADMIN', 'SUPER_ADMIN'], 'ORG'),
    item('/admin/users', 'nav.admin.users', ['ADMIN', 'SUPER_ADMIN'], 'ORG'),
    item('/admin/memberships', 'nav.admin.memberships', ['ADMIN', 'SUPER_ADMIN'], 'ORG'),
  ],
};

/** 8. RULES_TEMPLATES — Coverage Rules, KPI Templates */
const GROUP_RULES_TEMPLATES: NavGroup = {
  key: 'RULES_TEMPLATES',
  labelKey: 'nav.group.RULES_TEMPLATES',
  items: [
    item('/admin/coverage-rules', 'nav.admin.coverageRules', ['ADMIN', 'SUPER_ADMIN'], 'RULE'),
    item('/admin/kpi-templates', 'nav.admin.kpiTemplates', ['ADMIN', 'SUPER_ADMIN'], 'RULE'),
  ],
};

/** 9. INTEGRATIONS — Planner Sync, Planner Integration */
const GROUP_INTEGRATIONS: NavGroup = {
  key: 'INTEGRATIONS',
  labelKey: 'nav.group.INTEGRATIONS',
  items: [
    item('/sync/planner', 'nav.syncPlanner', ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'INTEGRATION'),
    item('/admin/integrations/planner', 'nav.plannerIntegration', ['ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'], 'INTEGRATION'),
  ],
};

/** 10. DATA_IMPORTS — Import Center, Monthly Snapshot, Historical Import, Import Issues */
const GROUP_DATA_IMPORTS: NavGroup = {
  key: 'DATA_IMPORTS',
  labelKey: 'nav.group.DATA_IMPORTS',
  items: [
    item('/admin/import', 'nav.admin.importDashboard', ['ADMIN', 'SUPER_ADMIN'], 'DATA'),
    item('/admin/import/monthly-snapshot', 'nav.admin.monthSnapshot', ['ADMIN', 'SUPER_ADMIN'], 'DATA'),
    item('/admin/import/historical', 'nav.admin.historicalImport', ['ADMIN', 'SUPER_ADMIN'], 'DATA'),
    item('/admin/import/issues', 'nav.admin.importIssues', ['ADMIN', 'SUPER_ADMIN'], 'DATA'),
    // Legacy: monthly-matrix accessible from Import Center; hidden from nav
    item('/admin/import/monthly-matrix', 'nav.admin.importMonthlyMatrix', ['ADMIN', 'SUPER_ADMIN'], 'LEGACY', true),
  ],
};

/** 11. SYSTEM_ADMIN — Administration, Audit Log, System Settings, Version, Utilities */
const GROUP_SYSTEM_ADMIN: NavGroup = {
  key: 'SYSTEM_ADMIN',
  labelKey: 'nav.group.SYSTEM_ADMIN',
  items: [
    item('/admin/administration', 'nav.admin.administrationDashboard', ['ADMIN', 'SUPER_ADMIN'], 'ADMIN'),
    item('/admin/audit/login', 'nav.admin.administrationAudit', ['ADMIN', 'SUPER_ADMIN'], 'ADMIN'),
    item('/admin/system', 'nav.admin.administrationSettings', ['ADMIN', 'SUPER_ADMIN'], 'ADMIN'),
    item('/admin/system/version', 'nav.admin.administrationVersion', ['ADMIN', 'SUPER_ADMIN'], 'ADMIN'),
    item('/admin/reset-emp-id', 'nav.admin.resetEmpId', ['ADMIN', 'SUPER_ADMIN'], 'UTILITY'),
    item('/admin/reset-password', 'nav.admin.resetPassword', ['ADMIN', 'SUPER_ADMIN'], 'UTILITY'),
  ],
};

/** 12. HELP — About */
const GROUP_HELP: NavGroup = {
  key: 'HELP',
  labelKey: 'nav.group.HELP',
  items: [
    item('/about', 'nav.about', ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER', 'DEMO_VIEWER'], 'CORE'),
  ],
};

/** Ordered groups. */
export const NAV_GROUPS: NavGroup[] = [
  GROUP_DASHBOARD,
  GROUP_TEAM,
  GROUP_SALES,
  GROUP_TASKS,
  GROUP_INVENTORY,
  GROUP_REPORTS,
  GROUP_ORGANIZATION,
  GROUP_RULES_TEMPLATES,
  GROUP_INTEGRATIONS,
  GROUP_DATA_IMPORTS,
  GROUP_SYSTEM_ADMIN,
  GROUP_HELP,
];

// --- Governance: validation & filtering ---

const ADMIN_GROUP_KEYS = new Set(['ORGANIZATION', 'RULES_TEMPLATES', 'INTEGRATIONS', 'DATA_IMPORTS', 'SYSTEM_ADMIN']);
const SUSPICIOUS_PATH_PATTERNS = [/\/test\b/, /\/debug\b/, /\/tmp\b/, /\/dev\b/];

export type NavValidationError = {
  code: 'MISSING_TYPE' | 'LEGACY_NOT_HIDDEN' | 'UTILITY_WRONG_GROUP' | 'CORE_IN_ADMIN_GROUP' | 'DUPLICATE_HREF';
  message: string;
  groupKey?: string;
  href?: string;
};

/**
 * Validates nav config. Throws in development if violations found.
 * Rules: every item has type; LEGACY must have hiddenFromNav; UTILITY only in SYSTEM_ADMIN; no duplicate href.
 */
export function validateNavConfig(): NavValidationError[] {
  const errors: NavValidationError[] = [];
  const seenHrefs = new Map<string, string>();

  for (const group of NAV_GROUPS) {
    for (const it of group.items) {
      const itemWithType = it as NavItem;
      if (!('type' in itemWithType) || itemWithType.type == null) {
        errors.push({
          code: 'MISSING_TYPE',
          message: `Nav item missing type: ${itemWithType.href}`,
          groupKey: group.key,
          href: itemWithType.href,
        });
      }
      if (itemWithType.type === 'LEGACY' && !itemWithType.hiddenFromNav) {
        errors.push({
          code: 'LEGACY_NOT_HIDDEN',
          message: `LEGACY item must have hiddenFromNav=true: ${itemWithType.href}`,
          groupKey: group.key,
          href: itemWithType.href,
        });
      }
      if (itemWithType.type === 'UTILITY' && group.key !== 'SYSTEM_ADMIN') {
        errors.push({
          code: 'UTILITY_WRONG_GROUP',
          message: `UTILITY item must be in SYSTEM_ADMIN: ${itemWithType.href} in ${group.key}`,
          groupKey: group.key,
          href: itemWithType.href,
        });
      }
      if (itemWithType.type === 'CORE' && ADMIN_GROUP_KEYS.has(group.key)) {
        errors.push({
          code: 'CORE_IN_ADMIN_GROUP',
          message: `CORE item must not be in admin group: ${itemWithType.href} in ${group.key}`,
          groupKey: group.key,
          href: itemWithType.href,
        });
      }
      const existing = seenHrefs.get(itemWithType.href);
      if (existing && existing !== group.key) {
        errors.push({
          code: 'DUPLICATE_HREF',
          message: `Duplicate href: ${itemWithType.href} in ${group.key} and ${existing}`,
          groupKey: group.key,
          href: itemWithType.href,
        });
      }
      if (!existing) seenHrefs.set(itemWithType.href, group.key);

      // Optional: suspicious path warning (console only)
      if (SUSPICIOUS_PATH_PATTERNS.some((p) => p.test(itemWithType.href))) {
        console.warn(`[nav] Suspicious path in nav: ${itemWithType.href}`);
      }
    }
  }

  return errors;
}

/** Exclude LEGACY and hiddenFromNav items from sidebar. */
function filterNavItemsForSidebar(items: NavItem[]): NavItem[] {
  return items.filter((it) => it.type !== 'LEGACY' && !it.hiddenFromNav);
}

// Run validation in development
if (process.env.NODE_ENV === 'development') {
  const errs = validateNavConfig();
  if (errs.length > 0) {
    const msg = `[navConfig] Validation failed:\n${errs.map((e) => `  - ${e.code}: ${e.message}`).join('\n')}`;
    throw new Error(msg);
  }
  checkNavAgainstRoleRoutes(NAV_GROUPS);
}

// --- RBAC & filtering ---

function itemVisible(
  user: Pick<User, 'role' | 'canEditSchedule'> & { canApproveWeek?: boolean },
  it: NavItem
): boolean {
  if (!it.roles.includes(user.role)) return false;
  if (it.href === '/schedule/edit' || it.href === '/schedule/editor') return canEditScheduleRbac(user);
  if (it.href === '/approvals') return user.canApproveWeek ?? canApproveWeekRbac(user);
  return true;
}

/** Filter REPORTS: remove Executive items when FEATURES.EXECUTIVE is false. */
function filterPerformanceItems(items: NavItem[]): NavItem[] {
  if (FEATURES.EXECUTIVE) return items;
  return items.filter((it) => !it.href.startsWith('/executive'));
}

/** Returns groups with only visible items. Governance filter applied before RBAC. */
export function getNavGroupsForUser(
  user: Pick<User, 'role' | 'canEditSchedule'> & { canApproveWeek?: boolean }
): Array<NavGroup & { items: NavItem[] }> {
  return NAV_GROUPS.map((group) => {
    let items = filterNavItemsForSidebar(group.items);
    if (group.key === 'REPORTS') items = filterPerformanceItems(items);
    return {
      ...group,
      items: items.filter((it) => itemVisible(user, it)),
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
    let items = filterNavItemsForSidebar(g.items);
    if (g.key === 'REPORTS' && !withExecutive) items = filterPerformanceItems(items);
    return items.filter((it) => it.roles.includes(role));
  });
}
