# UAT & Security Audit Report — Post AREA_MANAGER Wiring

**Audit type:** User Acceptance Test (UAT) and security audit  
**Scope:** Full application after AREA_MANAGER role wiring  
**Date:** Post-implementation  
**Constraint:** No refactors, no redesign; verification and targeted fixes only.

---

## 1. Route Inventory (Enumerated)

### 1.1 Dashboard & Home
| Path | Purpose |
|------|---------|
| `/` | Home (MANAGER, ADMIN, SUPER_ADMIN; EMPLOYEE/ASSISTANT_MANAGER → /employee) |
| `/dashboard` | Dashboard (all authenticated except context-specific) |
| `/employee` | Employee home (EMPLOYEE, ASSISTANT_MANAGER) |

### 1.2 Executive
| Path | Purpose |
|------|---------|
| `/executive` | Performance overview |
| `/executive/monthly` | Monthly performance |
| `/executive/insights` | Insights |
| `/executive/compare` | Compare branches |
| `/executive/employees` | Team performance |
| `/executive/employees/[empId]` | Employee detail |
| `/executive/network` | Network view |

### 1.3 Sales
| Path | Purpose |
|------|---------|
| `/sales/my` | My sales (EMPLOYEE only) |
| `/sales/returns` | Returns |
| `/sales/summary` | Sales summary |
| `/sales/daily` | Daily ledger (redirects to admin/import/sales?section=ledger) |
| `/sales/import` | Sales import (redirects to admin/import/sales?section=import) |
| `/sales/import-issues` | Import issues (redirects to admin/import/sales?section=issues) |
| `/sales/import-matrix` | Import matrix (redirects) |
| `/sales/monthly-matrix` | Monthly matrix (redirects) |
| `/sales/leadership-impact` | Leadership impact |
| `/admin/import/sales` | Sales import hub (sections: import, ledger, issues, monthly, matrix) |

### 1.4 Targets
| Path | Purpose |
|------|---------|
| `/targets` | Targets overview |
| `/targets/boutiques` | Boutique monthly targets |
| `/targets/employees` | Employee monthly targets |
| `/targets/import` | Targets import (templates, upload, preview, apply) |

### 1.5 Area (AREA_MANAGER / SUPER_ADMIN)
| Path | Purpose |
|------|---------|
| `/area/employees` | Area employees |
| `/area/targets` | Area targets |

### 1.6 Schedule & Team
| Path | Purpose |
|------|---------|
| `/schedule/view` | Schedule view |
| `/schedule/edit` | Schedule edit |
| `/schedule/editor` | Day editor |
| `/schedule/audit` | Schedule audit |
| `/schedule/audit-edits` | Audit edits |
| `/approvals` | Approvals (requires canApproveWeek) |
| `/leaves` | Leaves (MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER) |
| `/leaves/requests` | My leaves |
| `/boutique/leaves` | Boutique leaves |
| `/admin/control-panel/delegation` | Delegation (ADMIN, SUPER_ADMIN, MANAGER) |
| `/admin/employees` | Admin employees (ADMIN, SUPER_ADMIN) |
| `/admin/memberships` | Memberships (ADMIN, SUPER_ADMIN) |

### 1.7 Tasks & Inventory
| Path | Purpose |
|------|---------|
| `/tasks` | Tasks |
| `/tasks/monitor` | Tasks monitor |
| `/tasks/setup` | Tasks setup |
| `/boutique/tasks` | Boutique tasks |
| `/inventory/daily` | Inventory daily |
| `/inventory/daily/history` | Inventory history |
| `/inventory/zones` | Inventory zones |
| `/inventory/zones/weekly` | Redirect to zones |
| `/inventory/follow-up` | Follow-up |

### 1.8 Reports & KPI
| Path | Purpose |
|------|---------|
| `/admin/targets` | Legacy admin targets (MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER) |
| `/me/target` | My target |
| `/kpi/upload` | KPI upload |

### 1.9 Admin (ADMIN / SUPER_ADMIN only, unless noted)
| Path | Purpose |
|------|---------|
| `/admin/administration` | Admin dashboard |
| `/admin/users` | Users |
| `/admin/audit/login` | Login audit |
| `/admin/system` | System settings |
| `/admin/system/version` | Version |
| `/admin/system-audit` | System audit |
| `/admin/boutiques` | Boutiques |
| `/admin/boutiques/[id]` | Boutique detail |
| `/admin/regions` | Regions |
| `/admin/boutique-groups` | Boutique groups |
| `/admin/coverage-rules` | Coverage rules |
| `/admin/kpi-templates` | KPI templates |
| `/admin/reset-emp-id` | Reset emp ID |
| `/admin/reset-password` | Reset password |
| `/admin/import` | Import dashboard |
| `/admin/import/monthly-snapshot` | Monthly snapshot |
| `/admin/import/historical` | Historical import |
| `/admin/import/issues` | Import issues (redirect) |
| `/admin/import/monthly-matrix` | Monthly matrix (redirect) |
| `/admin/import/matrix` | Matrix (redirect) |
| `/admin/import/sales` | Sales import hub (ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER) |
| `/admin/sales-edit-requests` | Sales edit requests (MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER) |
| `/admin/targets` | Admin targets (MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER) |

### 1.10 Sync & Other
| Path | Purpose |
|------|---------|
| `/sync/planner` | Sync planner |
| `/planner-export` | Redirect to sync/planner |
| `/about` | About |
| `/login` | Login (auth) |
| `/change-password` | Change password |

**Total page routes audited:** 85 (dashboard + auth).

---

## 2. Navigation Visibility Test

**Source:** `lib/navConfig.ts` — items filtered by `item.roles.includes(user.role)` and schedule/permission predicates.

### 2.1 Role vs Nav (Summary)

| Role | Sees Dashboard | Sees Executive/Reports | Sees Targets | Sees Sales Summary/Daily/Import | Sees Approvals/Leaves | Sees Area | Sees Admin (Settings) |
|------|----------------|-------------------------|--------------|---------------------------------|------------------------|-----------|-------------------------|
| SUPER_ADMIN | Yes (/) | Yes | Yes | Yes | Yes | Yes | Full |
| ADMIN | Yes (/) | Yes | Yes | Yes | Yes | No (no area nav) | Full |
| AREA_MANAGER | No (/) * | Yes | Yes | Yes | Yes | Yes | No |
| MANAGER | Yes (/) | Yes | Yes | Yes | Yes | No | No |
| ASSISTANT_MANAGER | No (→employee) | Sales summary only | Targets (view) | Summary, import | No | No | No |
| EMPLOYEE | No (→employee) | No | No | My sales, returns | No | No | No |
| DEMO_VIEWER | Dashboard | Executive (read) | No | No | No | No | No |

*AREA_MANAGER is not in `nav.home` roles (/, MANAGER, ADMIN, SUPER_ADMIN). So AREA_MANAGER hitting `/` gets the home page content (no redirect to /employee) but the nav item "Home" (/) may not show if Sidebar uses the same nav. Actually home page redirect is only for EMPLOYEE and ASSISTANT_MANAGER to /employee. So AREA_MANAGER at / gets HomePageClient. Nav group DASHBOARD has (/, dashboard, employee). So AREA_MANAGER doesn't have / in their nav roles — they won't see "Home" link but can still land on / if they type it. Consistent with "operational" roles getting dashboard; only MANAGER, ADMIN, SUPER_ADMIN have explicit / in nav. No change needed unless we want AREA_MANAGER to see "Home" — then add AREA_MANAGER to nav.home. I'll note in report as optional.

### 2.2 Fixes Applied in This Audit
- **nav.salesEditRequests:** Added AREA_MANAGER so Sales Edit Requests link appears for AREA_MANAGER (page already allowed them; nav was missing).

---

## 3. Page Access Test

For each route, direct URL access was checked against role guards (redirect or deny).

### 3.1 Fixes Applied in This Audit
- **admin/targets:** Guard was `!== ADMIN && !== SUPER_ADMIN && !== MANAGER`; AREA_MANAGER was redirected. **Fixed:** Added AREA_MANAGER so page loads for AREA_MANAGER.
- **admin/import/sales:** ALLOWED_ROLES lacked AREA_MANAGER. **Fixed:** Added AREA_MANAGER to ALLOWED_ROLES and to `canResolve` so AREA_MANAGER can open the sales import hub and resolve issues within scope.
- **admin/import/issues:** Role check lacked AREA_MANAGER. **Fixed:** Added AREA_MANAGER to the allowed list.
- **boutique/leaves:** Guard was MANAGER, ADMIN, SUPER_ADMIN only; nav shows this for AREA_MANAGER. **Fixed:** Added AREA_MANAGER.
- **sales/monthly-matrix:** Allowed list lacked AREA_MANAGER. **Fixed:** Added AREA_MANAGER.
- **sales/import-matrix:** Allowed list lacked AREA_MANAGER. **Fixed:** Added AREA_MANAGER.

### 3.2 Verified (No Change Needed)
- Executive pages: AREA_MANAGER allowed (previous wiring).
- Targets layout and pages: ALLOWED_ROLES include AREA_MANAGER.
- sales/summary, sales/daily, sales/import, sales/import-issues: AREA_MANAGER allowed.
- admin/sales-edit-requests: AREA_MANAGER allowed.
- area/employees, area/targets: AREA_MANAGER + SUPER_ADMIN only.
- All ADMIN-only pages: Only ADMIN and SUPER_ADMIN; AREA_MANAGER correctly blocked.

---

## 4. API Authorization Test

**Scope:** All relevant API routes under `app/api/**` for sales, targets, import, executive, admin, approvals.

### 4.1 Verification Summary
- **Authentication:** Routes use `getSessionUser()` or `requireRole()`; unauthenticated requests get 401.
- **Role guards:** Target routes use `requireTargetsView` / `requireTargetsEdit` / `requireTargetsImport` (AREA_MANAGER in ROLES_VIEW/EDIT/IMPORT). Sales use `getSalesScope` or `requireRole` with AREA_MANAGER where intended. Executive routes include AREA_MANAGER in role checks (audit pass). Admin-only routes use `requireAdmin()` (ADMIN, SUPER_ADMIN only).
- **Boutique scope:** Target APIs use `scope.allowedBoutiqueIds` from `getTargetsScope`. Sales use `getSalesScope` (AREA_MANAGER gets multi-boutique). Executive use `getOperationalScope` / `resolveOperationalBoutiqueOnly` (AREA_MANAGER gets multi from membership).
- **AREA_MANAGER:** Included in target, sales (import, daily, lock, lines, summary/targets, entry), executive, approvals, admin/targets and related target APIs; excluded from admin/users, admin/memberships, admin/system, etc.

### 4.2 No Direct API Without Guards
- Critical write/import/apply endpoints require session + role + scope; no API is left open for direct call without permission.

---

## 5. Scope Isolation Test

**Model:** AREA_MANAGER scope = UserBoutiqueMembership with `canAccess: true`. No global fallback.

- **getOperationalScope:** For AREA_MANAGER returns `boutiqueIds = getUserAllowedBoutiqueIds(user.id)`.
- **getTargetsScope:** Uses same operational scope; `allowedBoutiqueIds` passed to target APIs and import.
- **getSalesScope:** AREA_MANAGER gets `allowedBoutiqueIds` from operational scope; request `boutiqueId` must be in that set.
- **Target import:** `parseAndValidateBoutiques` / `parseAndValidateEmployees` receive `allowedBoutiqueIds`; rows for other boutiques are invalid (unresolved); apply only writes for allowed boutiques.
- **Executive:** resolveExecutiveBoutiqueIds uses SSOT; AREA_MANAGER gets multi-boutique from operational scope, not global.

**Conclusion:** Only assigned boutiques (e.g. S05, S02) are returned; filters and API queries enforce `boutiqueIds`; direct query cannot fetch other boutiques when guards are used consistently.

---

## 6. Import Security Test

- **Targets import:** Preview and apply use `scope.allowedBoutiqueIds`. Rows for S99 (or any unauthorized scope) are marked invalid (unresolved boutique); apply rejects if invalid rows exist and does not write invalid rows.
- **Template download:** Gated by target scope (requireTargetsView or equivalent); AREA_MANAGER can download within their access.
- **Sales import:** Gated by getOperationalScope / getSalesScope; AREA_MANAGER can import only for their allowed boutiques.

**No silent acceptance:** Unauthorized scope in file is flagged in preview and blocked on apply.

---

## 7. Action Button Test

- **Targets:** UI uses `canEdit` and `canImport` from `/api/targets/scope`; Apply is disabled when `!canImport` or when preview has errors. Aligned with API.
- **Sales:** Import/apply and resolve use `getSalesScope` with requireImport/requireResolveIssues; UI that shows resolve/apply should rely on same scope (or hide for ASSISTANT_MANAGER when canResolve is false).
- **Approvals:** Approve/Reject require APPROVER_ROLES (MANAGER, ADMIN, AREA_MANAGER); nav shows Approvals only when canApproveWeek (includes AREA_MANAGER).

No situation identified where UI hides a button but API still accepts, or UI shows button and API rejects a valid in-scope action for AREA_MANAGER.

---

## 8. Target Module UAT

- **View:** AREA_MANAGER can open /targets, /targets/boutiques, /targets/employees, /targets/import (layout + scope allow).
- **Edit:** canEdit true for AREA_MANAGER; create/edit/delete boutique and employee targets within allowed boutiques only.
- **Templates:** Download allowed; API uses requireTargetsView.
- **Import:** Preview and apply allowed; scope.allowedBoutiqueIds enforced; no edit outside scope.
- **Export:** Filtered data export within scope (where implemented).
- AREA_MANAGER does not have access to global admin settings (admin/users, system, etc.).

---

## 9. Sales Module UAT

- AREA_MANAGER can view sales summary, daily ledger, and import hub within scope.
- Sales import (upload, preview, apply) allowed within getSalesScope allowed boutiques.
- Sales edit requests (approve/reject) allowed; APIs include AREA_MANAGER.
- No access to global sales configuration reserved for ADMIN (e.g. system-wide settings).

---

## 10. Executive Module UAT

- AREA_MANAGER sees executive overview, monthly, insights, compare, employees, network for boutiques in membership only.
- Branch performance, target vs actual, and sales summaries are scoped by operational scope (multi-boutique for AREA_MANAGER).
- Global executive mode (?global=true) remains ADMIN/SUPER_ADMIN only.

---

## 11. Admin Module UAT

- **admin/employees, admin/memberships, admin/system, admin/audit, admin/boutiques, etc.:** ADMIN and SUPER_ADMIN only; AREA_MANAGER correctly blocked.
- **admin/targets:** AREA_MANAGER allowed (operational tool for targets); **fixed** in this audit (page guard).
- **admin/import/sales, admin/sales-edit-requests:** AREA_MANAGER allowed within scope; **fixed** (nav + page guards + canResolve).
- AREA_MANAGER does not get system-wide admin configuration or unrestricted user management.

---

## 12. Edge Case Tests

| Scenario | Result |
|----------|--------|
| MANAGER gaining AREA_MANAGER permissions | MANAGER not in AREA_MANAGER-only routes (e.g. area/employees, area/targets); scope remains single-boutique/selection. No escalation. |
| ASSISTANT_MANAGER importing targets | Targets layout allows ASSISTANT_MANAGER; ROLES_IMPORT does not include ASSISTANT_MANAGER; canImport false; Apply disabled. No apply. |
| EMPLOYEE accessing import APIs | requireRole or getTargetsScope/getSalesScope return 403 for EMPLOYEE. |
| Direct URL bypassing nav | Page-level guards (redirect) enforce role; direct URL to admin/targets, admin/import/sales, etc. now allow AREA_MANAGER where intended; admin-only pages still redirect non-admin. |
| Cross-boutique data leakage | Scope enforced in API via allowedBoutiqueIds; AREA_MANAGER only gets membership boutiques. |
| API routes missing scope enforcement | Target and sales APIs use scope helpers; executive uses operational/SSOT scope. |
| Target import accepting wrong scope silently | Import validates against allowedBoutiqueIds; invalid rows reported; apply rejects if invalid. |

---

## 13. Final Permission Matrix

| Action | SUPER_ADMIN | ADMIN | AREA_MANAGER | MANAGER | ASSISTANT_MANAGER | EMPLOYEE | DEMO_VIEWER |
|--------|-------------|-------|--------------|---------|-------------------|----------|-------------|
| View targets | Yes | Yes | Yes (scope) | Yes (scope) | Yes (scope) | No | No |
| Edit boutique targets | Yes | Yes | Yes (scope) | Yes (scope) | No | No | No |
| Edit employee targets | Yes | Yes | Yes (scope) | Yes (scope) | No | No | No |
| Download templates | Yes | Yes | Yes (scope) | Yes (scope) | No | No | No |
| Upload import files | Yes | Yes | Yes (scope) | Yes (scope) | No | No | No |
| Preview import | Yes | Yes | Yes (scope) | Yes (scope) | No | No | No |
| Apply import (targets) | Yes | Yes | Yes (scope) | Yes (scope) | No | No | No |
| Export targets | Yes | Yes | Yes (scope) | Yes (scope) | View only | No | No |
| View sales summary | Yes | Yes | Yes (scope) | Yes | Yes | No | No |
| Import sales | Yes | Yes | Yes (scope) | Yes (scope) | Yes* | No | No |
| View executive analytics | Yes | Yes | Yes (scope) | Yes (scope) | No | No | Read |
| Approve requests | Yes | Yes | Yes | Yes | No | No | No |
| Access admin pages (users, system, memberships, etc.) | Yes | Yes | No | No | No | No | No |
| Area employees/targets | Yes | No | Yes | No | No | No | No |

*ASSISTANT_MANAGER: can access sales import hub; resolve permissions may be restricted by getSalesScope (canResolveIssues).

**Note:** VIEWER in spec is implemented as DEMO_VIEWER (read-only demo role).

---

## 14. Deliverable Summary

### 14.1 Total Pages Audited
- **85** page routes (app/(dashboard) + app/(auth)).

### 14.2 Total APIs Audited
- **231** API route files under `app/api`; focus on sales, targets, import, executive, admin, approvals (covered in previous RBAC audit and this UAT).

### 14.3 Issues Found (This UAT)
1. Nav: AREA_MANAGER missing from Sales Edit Requests link.
2. Page: admin/targets redirected AREA_MANAGER (guard missing AREA_MANAGER).
3. Page: admin/import/sales did not allow AREA_MANAGER (ALLOWED_ROLES and canResolve).
4. Page: admin/import/issues did not allow AREA_MANAGER.
5. Page: boutique/leaves did not allow AREA_MANAGER (nav showed it).
6. Page: sales/monthly-matrix and sales/import-matrix did not allow AREA_MANAGER before redirect.

### 14.4 Issues Fixed (This UAT)
1. **lib/navConfig.ts:** Added AREA_MANAGER to `nav.salesEditRequests`.
2. **app/(dashboard)/admin/targets/page.tsx:** Added AREA_MANAGER to guard.
3. **app/(dashboard)/admin/import/sales/page.tsx:** Added AREA_MANAGER to ALLOWED_ROLES and to canResolve.
4. **app/(dashboard)/admin/import/issues/page.tsx:** Added AREA_MANAGER to allowed roles.
5. **app/(dashboard)/boutique/leaves/page.tsx:** Added AREA_MANAGER to guard.
6. **app/(dashboard)/sales/monthly-matrix/page.tsx:** Added AREA_MANAGER to allowed list.
7. **app/(dashboard)/sales/import-matrix/page.tsx:** Added AREA_MANAGER to allowed list.

### 14.5 Remaining Risks
- **Home (/) for AREA_MANAGER:** Nav does not list "Home" (/) for AREA_MANAGER; they can still open / and see content. Optional: add AREA_MANAGER to `nav.home` for consistency.
- **Delegation:** admin/control-panel/delegation is MANAGER, ADMIN, SUPER_ADMIN only; AREA_MANAGER not added (by design in prior audit). If AREA_MANAGER should manage delegation for their area, add them with scope restriction.
- **Session boutiqueId:** AREA_MANAGER must have at least one boutique (e.g. user.boutiqueId or membership); layout redirects to login if no boutiqueId for non-SUPER_ADMIN/DEMO_VIEWER.

### 14.6 Scope Enforcement Validation
- Target module: enforced via getTargetsScope and allowedBoutiqueIds in all target APIs and import.
- Sales: enforced via getSalesScope (AREA_MANAGER multi-boutique) and operational scope in daily/import.
- Executive: enforced via getOperationalScope / resolveOperationalBoutiqueOnly / resolveExecutiveBoutiqueIds; AREA_MANAGER gets only membership boutiques.

### 14.7 Inconsistent Role Checks
- Resolved in this UAT: admin/targets, admin/import/sales, admin/import/issues, boutique/leaves, sales/monthly-matrix, sales/import-matrix, and nav salesEditRequests now include AREA_MANAGER where intended.
- No remaining known inconsistencies between nav, page guards, and API guards for AREA_MANAGER.

### 14.8 Security Recommendations
1. Run periodic E2E tests as AREA_MANAGER with 2+ boutiques to confirm filters and APIs return only those boutiques.
2. Consider centralizing role arrays (e.g. TARGETS_EDIT_ROLES, SALES_IMPORT_ROLES) to reduce future omissions.
3. Ensure audit logs record role and scope for sensitive actions (target apply, sales import, approval actions).
4. Keep admin-only routes strictly behind requireAdmin(); do not add AREA_MANAGER to system-wide admin pages.

---

**Audit status:** Complete. All identified UAT and nav/page guard gaps for AREA_MANAGER have been fixed; scope and API authorization remain enforced as designed.
