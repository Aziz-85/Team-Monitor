/**
 * Dashboard breadcrumb trail: human labels via i18n keys only (no URL segments in UI text).
 * `href` values are used for navigation only; visible text always comes from translation keys.
 */

export type DashboardCrumb = { labelKey: string; href?: string };

const HOME: DashboardCrumb = { labelKey: 'nav.drilldown.breadcrumbs.home', href: '/' };

/** Longest-prefix wins: full static paths → title translation key */
const PATH_TITLE_KEYS: Array<{ prefix: string; titleKey: string }> = [
  { prefix: '/admin/administration/access', titleKey: 'nav.admin.administrationAccess' },
  { prefix: '/admin/administration/audit', titleKey: 'nav.admin.administrationAudit' },
  { prefix: '/admin/administration/calendar', titleKey: 'nav.admin.administrationDashboard' },
  { prefix: '/admin/administration/settings', titleKey: 'nav.admin.administrationSettings' },
  { prefix: '/admin/administration/users', titleKey: 'nav.admin.administrationUsers' },
  { prefix: '/admin/administration/version', titleKey: 'nav.admin.administrationVersion' },
  { prefix: '/admin/administration', titleKey: 'nav.drilldown.routes.admin.administration.title' },
  { prefix: '/admin/audit/login', titleKey: 'nav.drilldown.routes.admin.loginAudit.title' },
  { prefix: '/admin/boutique-groups', titleKey: 'nav.drilldown.routes.admin.groups.title' },
  { prefix: '/admin/boutiques', titleKey: 'nav.drilldown.routes.admin.boutiques.title' },
  { prefix: '/admin/control-panel/delegation', titleKey: 'nav.admin.delegation' },
  { prefix: '/admin/coverage-rules', titleKey: 'nav.drilldown.routes.admin.coverageRules.title' },
  { prefix: '/admin/employees', titleKey: 'nav.drilldown.routes.employees.admin.title' },
  { prefix: '/admin/historical-import', titleKey: 'nav.drilldown.routes.imports.historicalLegacy.title' },
  { prefix: '/admin/import-center', titleKey: 'nav.drilldown.routes.imports.centerLegacy.title' },
  { prefix: '/admin/import/historical', titleKey: 'nav.drilldown.routes.imports.historical.title' },
  { prefix: '/admin/import/issues', titleKey: 'nav.drilldown.routes.imports.issues.title' },
  { prefix: '/admin/import/matrix', titleKey: 'nav.drilldown.routes.imports.matrix.title' },
  { prefix: '/admin/import/month-snapshot', titleKey: 'nav.drilldown.routes.imports.monthlySnapshot.title' },
  { prefix: '/admin/import/monthly-matrix', titleKey: 'nav.drilldown.routes.imports.monthlyMatrix.title' },
  { prefix: '/admin/import/monthly-snapshot', titleKey: 'nav.drilldown.routes.imports.monthlySnapshot.title' },
  { prefix: '/admin/import/sales', titleKey: 'nav.drilldown.routes.imports.salesAdmin.title' },
  { prefix: '/admin/import', titleKey: 'nav.drilldown.routes.imports.center.title' },
  { prefix: '/admin/integrations/planner/completions', titleKey: 'nav.drilldown.routes.admin.plannerCompletions.title' },
  { prefix: '/admin/integrations/planner', titleKey: 'nav.drilldown.routes.admin.planner.title' },
  { prefix: '/admin/kpi-templates', titleKey: 'nav.drilldown.routes.admin.kpiTemplates.title' },
  { prefix: '/admin/memberships', titleKey: 'nav.drilldown.routes.admin.memberships.title' },
  { prefix: '/admin/regions', titleKey: 'nav.drilldown.routes.admin.regions.title' },
  { prefix: '/admin/reset-emp-id', titleKey: 'nav.drilldown.routes.admin.resetEmpId.title' },
  { prefix: '/admin/reset-password', titleKey: 'nav.drilldown.routes.admin.resetPassword.title' },
  { prefix: '/admin/sales-edit-requests', titleKey: 'nav.salesEditRequests' },
  { prefix: '/admin/sales-integrity', titleKey: 'admin.salesIntegrity.title' },
  { prefix: '/admin/system-audit', titleKey: 'nav.drilldown.routes.admin.systemAudit.title' },
  { prefix: '/admin/system/version', titleKey: 'nav.drilldown.routes.admin.version.title' },
  { prefix: '/admin/system', titleKey: 'nav.drilldown.routes.admin.system.title' },
  { prefix: '/admin/targets', titleKey: 'nav.drilldown.routes.reports.targetsAdmin.title' },
  { prefix: '/admin/users', titleKey: 'nav.drilldown.routes.admin.users.title' },
  { prefix: '/approvals', titleKey: 'nav.drilldown.routes.schedule.approvals.title' },
  { prefix: '/area/employees', titleKey: 'nav.drilldown.routes.employees.area.title' },
  { prefix: '/area/targets', titleKey: 'nav.drilldown.routes.employees.areaTargets.title' },
  { prefix: '/boutique/leaves', titleKey: 'nav.drilldown.routes.leaves.boutique.title' },
  { prefix: '/boutique/tasks', titleKey: 'nav.drilldown.routes.tasks.boutique.title' },
  { prefix: '/company/alerts', titleKey: 'nav.company.alerts' },
  { prefix: '/company/branches', titleKey: 'nav.company.branches' },
  { prefix: '/company/employees', titleKey: 'nav.company.employees' },
  { prefix: '/company/governance', titleKey: 'nav.company.governance' },
  { prefix: '/company', titleKey: 'nav.company.overview' },
  { prefix: '/compliance', titleKey: 'nav.drilldown.routes.leaves.compliance.title' },
  { prefix: '/dashboard', titleKey: 'nav.dashboard' },
  { prefix: '/employee', titleKey: 'nav.employeeHome' },
  { prefix: '/executive/compare', titleKey: 'nav.drilldown.routes.reports.compare.title' },
  { prefix: '/executive/employees', titleKey: 'nav.drilldown.routes.reports.employees.title' },
  { prefix: '/executive/insights', titleKey: 'nav.drilldown.routes.reports.insights.title' },
  { prefix: '/executive/monthly', titleKey: 'nav.drilldown.routes.reports.monthly.title' },
  { prefix: '/executive/network', titleKey: 'nav.breadcrumb.executiveNetwork' },
  { prefix: '/executive', titleKey: 'nav.drilldown.routes.reports.executive.title' },
  { prefix: '/inventory/daily/history', titleKey: 'nav.drilldown.routes.inventory.history.title' },
  { prefix: '/inventory/daily', titleKey: 'nav.drilldown.routes.inventory.daily.title' },
  { prefix: '/inventory/follow-up', titleKey: 'nav.drilldown.routes.inventory.followup.title' },
  { prefix: '/inventory/zones/weekly', titleKey: 'nav.breadcrumb.inventoryZonesWeekly' },
  { prefix: '/inventory/zones', titleKey: 'nav.drilldown.routes.inventory.zones.title' },
  { prefix: '/kpi/upload', titleKey: 'nav.kpiUpload' },
  { prefix: '/leaves/requests', titleKey: 'nav.drilldown.routes.leaves.myRequests.title' },
  { prefix: '/leaves', titleKey: 'nav.drilldown.routes.leaves.manage.title' },
  { prefix: '/me/target', titleKey: 'nav.myTarget' },
  { prefix: '/performance', titleKey: 'nav.reports.performanceHub' },
  { prefix: '/planner-export', titleKey: 'nav.breadcrumb.plannerExport' },
  { prefix: '/reports/weekly', titleKey: 'nav.drilldown.routes.reports.weekly.title' },
  { prefix: '/sales/daily', titleKey: 'nav.drilldown.routes.sales.daily.title' },
  { prefix: '/sales/import-issues', titleKey: 'nav.drilldown.routes.sales.importIssues.title' },
  { prefix: '/sales/import-matrix', titleKey: 'nav.drilldown.routes.sales.importMatrix.title' },
  { prefix: '/sales/import', titleKey: 'nav.drilldown.routes.sales.import.title' },
  { prefix: '/sales/leadership-impact', titleKey: 'nav.drilldown.routes.sales.leadership.title' },
  { prefix: '/sales/monthly-matrix', titleKey: 'nav.drilldown.routes.sales.monthlyMatrix.title' },
  { prefix: '/sales/my', titleKey: 'nav.drilldown.routes.sales.my.title' },
  { prefix: '/sales/returns', titleKey: 'nav.drilldown.routes.sales.returns.title' },
  { prefix: '/sales/summary', titleKey: 'nav.drilldown.routes.sales.summary.title' },
  { prefix: '/schedule/audit-edits', titleKey: 'nav.drilldown.routes.schedule.auditEdits.title' },
  { prefix: '/schedule/audit', titleKey: 'nav.drilldown.routes.schedule.audit.title' },
  { prefix: '/schedule/editor', titleKey: 'nav.drilldown.routes.schedule.dayEditor.title' },
  { prefix: '/schedule/edit', titleKey: 'nav.drilldown.routes.schedule.edit.title' },
  { prefix: '/schedule/view', titleKey: 'nav.drilldown.routes.schedule.view.title' },
  { prefix: '/schedule', titleKey: 'nav.drilldown.routes.schedule.view.title' },
  { prefix: '/sync/planner', titleKey: 'nav.drilldown.operations.sync.title' },
  { prefix: '/targets/boutiques', titleKey: 'nav.drilldown.routes.reports.targetsBoutiques.title' },
  { prefix: '/targets/employees', titleKey: 'nav.drilldown.routes.reports.targetsEmployees.title' },
  { prefix: '/targets/import', titleKey: 'nav.drilldown.routes.reports.targetsImport.title' },
  { prefix: '/targets', titleKey: 'nav.drilldown.routes.reports.targets.title' },
  { prefix: '/tasks/monitor', titleKey: 'nav.drilldown.routes.tasks.monitor.title' },
  { prefix: '/tasks/setup', titleKey: 'nav.drilldown.routes.tasks.setup.title' },
  { prefix: '/tasks', titleKey: 'nav.drilldown.routes.tasks.list.title' },
  { prefix: '/about', titleKey: 'nav.drilldown.routes.admin.about.title' },
];

PATH_TITLE_KEYS.sort((a, b) => b.prefix.length - a.prefix.length);

const NAV_SECTION_KEY: Record<string, string> = {
  analytics: 'nav.drilldown.sections.analytics.title',
  system: 'nav.drilldown.sections.system.title',
  team: 'nav.drilldown.sections.team.title',
  operations: 'nav.drilldown.sections.operations.title',
};

/** `/nav/{section}` hub or `/nav/{section}/{leaf}` — labels match drilldown hubs (i18n under nav.drilldown.*). */
const NAV_LEAF_TITLE_KEY: Record<string, string> = {
  '/nav/analytics/sales': 'nav.drilldown.analytics.sales.title',
  '/nav/analytics/reports': 'nav.drilldown.analytics.reports.title',
  '/nav/system/admin': 'nav.drilldown.system.admin.title',
  '/nav/system/imports': 'nav.drilldown.system.imports.title',
  '/nav/team/schedule': 'nav.drilldown.team.schedule.title',
  '/nav/team/leaves': 'nav.drilldown.team.leaves.title',
  '/nav/team/employees': 'nav.drilldown.team.employees.title',
  '/nav/operations/tasks': 'nav.drilldown.operations.tasks.title',
  '/nav/operations/inventory': 'nav.drilldown.operations.inventory.title',
};

function parseNavDrilldown(pathname: string): { section: string; leafSegment?: string } | null {
  if (!pathname.startsWith('/nav')) return null;
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'nav' || parts.length < 2) return null;
  const section = parts[1];
  if (!NAV_SECTION_KEY[section]) return null;
  if (parts.length === 2) return { section };
  if (parts.length === 3) return { section, leafSegment: parts[2] };
  return null;
}

function buildNavDrilldownTrail(path: string): DashboardBreadcrumbResult | null {
  const parsed = parseNavDrilldown(path);
  if (!parsed) return null;

  const crumbs: DashboardCrumb[] = [HOME];
  const sectionKey = NAV_SECTION_KEY[parsed.section];
  const sectionHref = `/nav/${parsed.section}`;

  if (!parsed.leafSegment) {
    crumbs.push({ labelKey: sectionKey });
  } else {
    const leafKey = NAV_LEAF_TITLE_KEY[path] ?? 'nav.breadcrumb.fallbackTitle';
    crumbs.push({ labelKey: sectionKey, href: sectionHref });
    crumbs.push({ labelKey: leafKey });
  }

  const deduped: DashboardCrumb[] = [];
  for (const c of crumbs) {
    const last = deduped[deduped.length - 1];
    if (last && last.labelKey === c.labelKey) continue;
    deduped.push(c);
  }

  const secondLastWithHref = [...deduped].reverse().find((c) => c.href != null && c.href !== path);
  const backHref = secondLastWithHref?.href ?? (deduped.length > 1 ? deduped[deduped.length - 2]?.href ?? '/' : '/');

  return {
    crumbs: deduped,
    backHref: deduped.length > 1 ? backHref : null,
    showBack: deduped.length > 1,
  };
}

function resolveTitleKey(pathname: string): string {
  let p = pathname.split('?')[0] || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  while (p.length >= 1) {
    const hit = PATH_TITLE_KEYS.find((t) => t.prefix === p);
    if (hit) return hit.titleKey;
    const last = p.lastIndexOf('/');
    if (last <= 0) break;
    p = p.slice(0, last);
  }
  return 'nav.breadcrumb.fallbackTitle';
}

function getSection(pathname: string): { labelKey: string; href: string } | null {
  if (pathname.startsWith('/admin') || pathname.startsWith('/kpi')) {
    return { labelKey: 'nav.drilldown.sections.system.title', href: '/nav/system' };
  }
  if (pathname.startsWith('/company')) {
    return { labelKey: 'nav.drilldown.sections.analytics.title', href: '/nav/analytics' };
  }
  if (
    pathname.startsWith('/executive') ||
    pathname.startsWith('/sales') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/performance')
  ) {
    return { labelKey: 'nav.drilldown.sections.analytics.title', href: '/nav/analytics' };
  }
  if (
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/boutique/tasks') ||
    pathname.startsWith('/sync') ||
    pathname.startsWith('/planner-export')
  ) {
    return { labelKey: 'nav.drilldown.sections.operations.title', href: '/nav/operations' };
  }
  if (
    pathname.startsWith('/schedule') ||
    pathname.startsWith('/leaves') ||
    pathname.startsWith('/approvals') ||
    pathname.startsWith('/employee') ||
    pathname.startsWith('/boutique/leaves') ||
    pathname.startsWith('/compliance')
  ) {
    return { labelKey: 'nav.drilldown.sections.team.title', href: '/nav/team' };
  }
  if (pathname.startsWith('/area')) {
    return { labelKey: 'nav.group.AREA_MANAGER', href: '/dashboard' };
  }
  if (pathname.startsWith('/targets') || pathname.startsWith('/admin/targets')) {
    return { labelKey: 'nav.drilldown.analytics.targets.title', href: '/nav/analytics' };
  }
  return null;
}

function getHub(pathname: string): { labelKey: string; href: string } | null {
  if (pathname.startsWith('/company/')) {
    return { labelKey: 'nav.company.overview', href: '/company' };
  }
  if (!pathname.startsWith('/admin')) return null;
  if (pathname === '/admin/administration') return null;

  if (
    pathname.startsWith('/admin/import') ||
    pathname.startsWith('/admin/import-center') ||
    pathname.startsWith('/admin/historical-import')
  ) {
    return { labelKey: 'nav.drilldown.system.imports.title', href: '/nav/system/imports' };
  }
  if (
    pathname.startsWith('/admin/system') ||
    pathname.startsWith('/admin/audit/login') ||
    pathname.startsWith('/admin/system-audit')
  ) {
    return { labelKey: 'nav.drilldown.routes.admin.system.title', href: '/admin/system' };
  }
  if (pathname.startsWith('/admin/integrations')) {
    return { labelKey: 'nav.drilldown.system.integrations.title', href: '/nav/system' };
  }
  return { labelKey: 'nav.drilldown.routes.admin.administration.title', href: '/admin/administration' };
}

export type DashboardBreadcrumbResult = {
  crumbs: DashboardCrumb[];
  /** Prefer router.back(); else navigate here */
  backHref: string | null;
  showBack: boolean;
};

export function getDashboardBreadcrumbTrail(pathname: string): DashboardBreadcrumbResult | null {
  const path = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (path === '/') {
    return { crumbs: [HOME], backHref: null, showBack: false };
  }

  const navTrail = buildNavDrilldownTrail(path);
  if (navTrail) return navTrail;

  const titleKey = resolveTitleKey(path);
  const section = getSection(path);
  const hub = getHub(path);

  const crumbs: DashboardCrumb[] = [HOME];
  if (section) crumbs.push({ labelKey: section.labelKey, href: section.href });
  if (hub) crumbs.push({ labelKey: hub.labelKey, href: hub.href });

  const lastTitle: DashboardCrumb = { labelKey: titleKey };
  const prev = crumbs[crumbs.length - 1];
  if (!prev || prev.labelKey !== lastTitle.labelKey) {
    crumbs.push(lastTitle);
  }

  const deduped: DashboardCrumb[] = [];
  for (const c of crumbs) {
    const last = deduped[deduped.length - 1];
    if (last && last.labelKey === c.labelKey) continue;
    deduped.push(c);
  }
  crumbs.length = 0;
  crumbs.push(...deduped);

  const secondLastWithHref = [...crumbs].reverse().find((c) => c.href != null && c.href !== path);
  const backHref = secondLastWithHref?.href ?? (crumbs.length > 1 ? crumbs[crumbs.length - 2]?.href ?? '/' : '/');

  return {
    crumbs,
    backHref: crumbs.length > 1 ? backHref : null,
    showBack: crumbs.length > 1,
  };
}
