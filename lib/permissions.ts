import { FEATURES } from '@/lib/featureFlags';

/** Matches Prisma schema enum Role — use this type to avoid depending on Prisma client export. */
export type Role =
  | 'EMPLOYEE'
  | 'MANAGER'
  | 'ASSISTANT_MANAGER'
  | 'ADMIN'
  | 'AREA_MANAGER'
  | 'SUPER_ADMIN'
  | 'DEMO_VIEWER';

/** Roles that can edit schedule (batch save) and access /schedule/edit */
export const SCHEDULE_EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

// --- Phase F: Lock & approval (by role only, no DB) ---
export function canLockUnlockDay(role: Role): boolean {
  return role === 'ASSISTANT_MANAGER' || role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}
/** Sprint 1: Lock Week = Admin / Super Admin only */
export function canLockWeek(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}
export function canUnlockWeek(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}
export function canApproveWeek(role: Role): boolean {
  return role === 'MANAGER' || role === 'AREA_MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/** Roles that can view full schedule grid (all rows) on /schedule/view */
export const SCHEDULE_VIEW_FULL_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export function canEditSchedule(role: Role): boolean {
  return SCHEDULE_EDIT_ROLES.includes(role);
}

export function canViewFullSchedule(role: Role): boolean {
  return SCHEDULE_VIEW_FULL_ROLES.includes(role);
}

/** Compliance / Expiry Tracker: view and manage (SUPER_ADMIN, ADMIN, AREA_MANAGER, MANAGER only). */
export const COMPLIANCE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER', 'MANAGER'];

export function canViewCompliance(role: Role): boolean {
  return COMPLIANCE_ROLES.includes(role);
}

export function canManageCompliance(role: Role): boolean {
  return COMPLIANCE_ROLES.includes(role);
}

/** Sprint 2B: MANAGER/ADMIN/SUPER_ADMIN auto-apply; ASSISTANT_MANAGER must go through approval. */
export function canAutoApprove(role: Role): boolean {
  return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function requiresApproval(role: Role): boolean {
  return role === 'ASSISTANT_MANAGER';
}

/**
 * Route access matrix for `canAccessRoute` / `RouteGuard`: which path prefixes each role may open.
 *
 * **Relationship to nav:** `lib/navConfig.ts` drives the **sidebar** (labels, grouping, visibility).
 * Not every allowed route appears in the nav (hidden admin tools, deep links, legacy aliases).
 * Development checks: `lib/navConsistency.ts` warns if a nav item lists a role that `ROLE_ROUTES` denies.
 *
 * When adding routes: update both this matrix and `lib/navConfig.ts` so sidebar and deep links stay aligned.
 * (AR) غيّر هنا لتظهر أو تُخفى الصفحات حسب الدور (مع الحفاظ على اتساق nav عند الإضافة).
 */
export const ROLE_ROUTES: Record<Role, string[]> = {
  EMPLOYEE: [
    '/nav',
    '/dashboard',
    '/employee',
    '/schedule/view',
    '/tasks',
    '/me/target',
    '/sales/my',
    '/sales/returns',
    '/leaves/requests',
    '/inventory/daily',
    '/inventory/zones',
    '/about',
    '/change-password',
  ],
  MANAGER: [
    '/nav',
    '/',
    '/dashboard',
    '/executive',
    '/executive/monthly',
    '/executive/insights',
    '/executive/compare',
    '/executive/employees',
    '/performance',
    '/approvals',
    '/schedule',
    '/schedule/view',
    '/schedule/edit',
    '/schedule/audit',
    '/schedule/audit-edits',
    '/tasks',
    '/tasks/monitor',
    '/tasks/setup',
    '/planner-export',
    '/sync/planner',
    '/leaves',
    '/boutique/leaves',
    '/boutique/tasks',
    '/inventory/daily',
    '/inventory/daily/history',
    '/inventory/zones',
    '/inventory/follow-up',
    '/admin/employees',
    '/admin/targets',
    '/targets',
    '/admin/sales-edit-requests',
    '/admin/control-panel/delegation',
    '/admin/import/sales',
    '/sales/daily',
    '/reports/weekly',
    '/sales/summary',
    '/sales/returns',
    '/sales/import',
    '/sales/import-matrix',
    '/sales/import-issues',
    '/sales/monthly-matrix',
    '/sales/leadership-impact',
    '/kpi/upload',
    '/me/target',
    '/compliance',
    '/about',
    '/change-password',
  ],
  /** مساعد المدير: نفس صلاحيات الموظف + تعديل الجدول الأسبوعي + المصفوفة الشهرية */
  ASSISTANT_MANAGER: [
    '/nav',
    '/dashboard',
    '/employee',
    '/schedule/view',
    '/schedule/edit',
    '/schedule/editor',
    '/tasks',
    '/me/target',
    '/leaves/requests',
    '/inventory/daily',
    '/inventory/zones',
    '/sales/summary',
    '/sales/returns',
    '/admin/import/sales',
    '/sales/import',
    '/sales/import-issues',
    '/sales/monthly-matrix',
    '/targets',
    '/about',
    '/change-password',
  ],
  ADMIN: [
    '/nav',
    '/',
    '/dashboard',
    '/executive',
    '/executive/monthly',
    '/executive/insights',
    '/executive/compare',
    '/executive/employees',
    '/performance',
    '/approvals',
    '/schedule',
    '/schedule/view',
    '/schedule/edit',
    '/schedule/audit',
    '/schedule/audit-edits',
    '/tasks',
    '/tasks/monitor',
    '/tasks/setup',
    '/planner-export',
    '/sync/planner',
    '/leaves',
    '/boutique/leaves',
    '/boutique/tasks',
    '/inventory/daily',
    '/inventory/daily/history',
    '/inventory/zones',
    '/inventory/follow-up',
    '/admin/employees',
    '/admin/targets',
    '/admin/sales-edit-requests',
    '/admin/users',
    '/admin/reset-emp-id',
    '/admin/reset-password',
    '/admin/coverage-rules',
    '/admin/kpi-templates',
    '/admin/import',
    '/admin/import-center',
    '/admin/historical-import',
    '/admin/administration',
    '/admin/audit/login',
    '/admin/boutiques',
    '/admin/regions',
    '/admin/boutique-groups',
    '/admin/memberships',
    '/admin/integrations/planner',
    '/admin/integrations/planner/completions',
    '/admin/control-panel/delegation',
    '/admin/system',
    '/admin/system/version',
    '/admin/system-audit',
    '/targets',
    '/sales/daily',
    '/reports/weekly',
    '/sales/summary',
    '/sales/returns',
    '/sales/import',
    '/sales/import-matrix',
    '/sales/import-issues',
    '/sales/monthly-matrix',
    '/sales/leadership-impact',
    '/kpi/upload',
    '/me/target',
    '/compliance',
    '/about',
    '/change-password',
  ],
  AREA_MANAGER: [
    '/nav',
    '/',
    '/dashboard',
    '/executive',
    '/executive/monthly',
    '/executive/insights',
    '/executive/compare',
    '/executive/employees',
    '/performance',
    '/approvals',
    '/schedule/view',
    '/sync/planner',
    '/leaves',
    '/boutique/leaves',
    '/tasks',
    '/area/employees',
    '/area/targets',
    '/targets',
    '/targets/boutiques',
    '/targets/employees',
    '/targets/import',
    '/admin/targets',
    '/admin/import/sales',
    '/admin/sales-edit-requests',
    '/admin/integrations/planner',
    '/sales/summary',
    '/sales/daily',
    '/reports/weekly',
    '/sales/returns',
    '/sales/leadership-impact',
    '/me/target',
    '/compliance',
    '/about',
    '/change-password',
  ],
  DEMO_VIEWER: [
    '/nav',
    '/dashboard',
    '/executive',
    '/executive/monthly',
    '/executive/insights',
    '/executive/compare',
    '/executive/employees',
    '/schedule/view',
    '/kpi/upload',
    '/about',
    '/change-password',
  ],
  SUPER_ADMIN: [
    '/nav',
    '/',
    '/dashboard',
    '/company',
    '/executive',
    '/executive/monthly',
    '/executive/insights',
    '/executive/compare',
    '/executive/employees',
    '/performance',
    '/approvals',
    '/schedule',
    '/schedule/view',
    '/schedule/edit',
    '/schedule/audit',
    '/schedule/audit-edits',
    '/tasks',
    '/tasks/monitor',
    '/tasks/setup',
    '/planner-export',
    '/sync/planner',
    '/leaves',
    '/boutique/leaves',
    '/boutique/tasks',
    '/inventory/daily',
    '/inventory/daily/history',
    '/inventory/zones',
    '/inventory/follow-up',
    '/admin/employees',
    '/admin/targets',
    '/admin/sales-edit-requests',
    '/admin/users',
    '/admin/reset-emp-id',
    '/admin/reset-password',
    '/admin/coverage-rules',
    '/admin/kpi-templates',
    '/admin/import',
    '/admin/import-center',
    '/admin/historical-import',
    '/admin/administration',
    '/admin/audit/login',
    '/admin/boutiques',
    '/admin/regions',
    '/admin/boutique-groups',
    '/admin/memberships',
    '/admin/integrations/planner',
    '/admin/integrations/planner/completions',
    '/admin/control-panel/delegation',
    '/admin/system',
    '/admin/system/version',
    '/admin/system-audit',
    '/area/employees',
    '/area/targets',
    '/targets',
    '/sales/daily',
    '/reports/weekly',
    '/sales/summary',
    '/sales/returns',
    '/sales/import',
    '/sales/import-matrix',
    '/sales/import-issues',
    '/sales/monthly-matrix',
    '/sales/leadership-impact',
    '/kpi/upload',
    '/me/target',
    '/compliance',
    '/about',
    '/change-password',
  ],
};


export { getNavLinksForUser, getNavLinksForRole } from '@/lib/navConfig';

export function canAccessRoute(role: Role, pathname: string): boolean {
  const allowed = ROLE_ROUTES[role];
  if (!allowed) return false;
  const effective = FEATURES.EXECUTIVE ? allowed : allowed.filter((r) => !r.startsWith('/executive'));
  if (effective.includes(pathname)) return true;
  return effective.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

/** True if role is read-only demo (no edits, no admin, no export). */
export function isDemoViewer(role: Role): boolean {
  return role === 'DEMO_VIEWER';
}

