# AREA_MANAGER RBAC & Scope Audit — Post-Implementation

## 1. Executive Summary

A full RBAC and scope audit was performed after wiring the **AREA_MANAGER** role. The role was already present in the schema and partially wired; the previous pass added scope, targets, nav, and many APIs. This audit identified **additional API routes and pages** that still used hardcoded `MANAGER`/`ADMIN` checks and **sales ledger scope** logic that did not grant AREA_MANAGER multi-boutique access.

**Findings:**
- **Executive APIs**: Six routes (anomalies, compare, alerts, trends, yoy, month-snapshot) only allowed MANAGER and ADMIN; SUPER_ADMIN and AREA_MANAGER were added where appropriate.
- **Sales APIs**: Import (main, monthly-sheet, yearly), daily lock, daily lines, summary/targets, and sales entry were updated to include AREA_MANAGER; sales entry and ledger RBAC were extended so AREA_MANAGER can enter sales and import/resolve within their assigned boutiques.
- **Sales ledger scope**: `getSalesScope` in `lib/sales/ledgerRbac.ts` was updated so AREA_MANAGER receives multiple `allowedBoutiqueIds` from operational scope and has `canImport` and `canResolveIssues` within that set.
- **Pages**: sales/daily, admin/sales-edit-requests, sales/summary, and executive/network were updated to allow AREA_MANAGER.
- **Approvals / admin**: Reject approval routes, reset-employee-targets, generate-employee-targets, boutique-target, employee-target, clear-sales-month, and mobile dashboard targets source now include AREA_MANAGER where intended.

**Target module**: Already enforced via `requireTargetsImport` / `getTargetsScope` and `allowedBoutiqueIds`; import preview/apply only process rows for allowed boutiques. No change required for scope enforcement.

**Result**: AREA_MANAGER is now consistently supported across executive, sales, targets, and approvals within assigned scope, without admin-only or global access.

---

## 2. AREA_MANAGER Wiring Status

- **Fully wired** for:
  - Scope (multi-boutique from UserBoutiqueMembership via `getOperationalScope` / `getTargetsScope`)
  - Target module (view, edit, import, template download, preview, apply)
  - Executive (all read-only endpoints and pages)
  - Sales (summary, daily, import, import preview/template, daily lock/lines, entry, import-issues via ledger RBAC)
  - Approvals (list, reject) and sales-edit-requests (approve, reject)
  - Admin/targets and related target APIs (generate-employee-targets, reset-employee-targets, boutique-target, employee-target, clear-sales-month)
  - Nav (targets, executive, sales summary/daily, admin/targets, sales import, approvals, leaves)
- **Intentionally not wired**: Admin-only pages (users, system, audit, memberships, boutiques, regions, import dashboard, etc.); global `?global=true` remains ADMIN/SUPER_ADMIN only.

---

## 3. Files Changed in This Audit

| File | Change |
|------|--------|
| `app/api/executive/anomalies/route.ts` | Role check: add AREA_MANAGER, SUPER_ADMIN |
| `app/api/executive/compare/route.ts` | Role check: add AREA_MANAGER, SUPER_ADMIN |
| `app/api/executive/alerts/route.ts` | Role check: add AREA_MANAGER, SUPER_ADMIN |
| `app/api/executive/trends/route.ts` | Role check: add AREA_MANAGER, SUPER_ADMIN |
| `app/api/executive/yoy/route.ts` | Role check: add AREA_MANAGER |
| `app/api/executive/month-snapshot/route.ts` | Role check: add AREA_MANAGER |
| `app/api/sales/import/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/import/monthly-sheet/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/import/yearly/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/import/preview/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/import/template/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/daily/lock/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/daily/lines/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/summary/targets/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/api/sales/entry/route.ts` | requireRole + canManageSales branch: add AREA_MANAGER |
| `app/api/approvals/[id]/reject/route.ts` | APPROVER_ROLES: add AREA_MANAGER |
| `app/api/admin/sales-edit-requests/[id]/reject/route.ts` | APPROVER_ROLES: add AREA_MANAGER |
| `app/api/admin/reset-employee-targets/route.ts` | requireRole: add AREA_MANAGER |
| `app/api/admin/generate-employee-targets/route.ts` | ADMIN_ROLES: add AREA_MANAGER |
| `app/api/admin/boutique-target/route.ts` | ADMIN_ROLES: add AREA_MANAGER |
| `app/api/admin/employee-target/route.ts` | ADMIN_ROLES: add AREA_MANAGER |
| `app/api/admin/clear-sales-month/route.ts` | ADMIN_ROLES: add AREA_MANAGER |
| `app/api/mobile/dashboard/targets/source/route.ts` | ALLOWED_ROLES: add AREA_MANAGER |
| `app/(dashboard)/sales/daily/page.tsx` | Redirect: allow AREA_MANAGER |
| `app/(dashboard)/admin/sales-edit-requests/page.tsx` | Redirect: allow AREA_MANAGER |
| `app/(dashboard)/sales/summary/page.tsx` | Redirect: allow AREA_MANAGER |
| `app/(dashboard)/executive/network/page.tsx` | Redirect: allow AREA_MANAGER |
| `lib/sales/ledgerRbac.ts` | getSalesScope: AREA_MANAGER multi-boutique (op.boutiqueIds), canImport/canResolveIssues/canAddManualReturn within scope |

---

## 4. Pages / Routes Audited

- **Dashboard, home**: No role gate change; AREA_MANAGER already in nav.
- **Executive**: All pages and APIs (route, monthly, insights, compare, employees, network, anomalies, alerts, trends, yoy, month-snapshot) — role checks updated to include AREA_MANAGER where appropriate.
- **Sales**: summary, daily, import, import-issues, entry, daily/lock, daily/lines, summary/targets, returns — APIs and pages updated; ledger RBAC extended for AREA_MANAGER.
- **Targets**: /targets, /targets/boutiques, /targets/employees, /targets/import — already gated by getTargetsScope and requireTargetsView/Edit/Import; scope = allowedBoutiqueIds.
- **Target import**: Preview/apply use scope.allowedBoutiqueIds; parse/apply only allow allowed boutiques; cross-scope rows invalid/rejected.
- **Schedule / planner / KPI / leaves**: No AREA_MANAGER expansion (schedule edit remains MANAGER/ASSISTANT_MANAGER/ADMIN/SUPER_ADMIN; AREA_MANAGER has approvals/leaves as previously wired).
- **Admin**: Only admin/targets and sales-edit-requests pages/APIs opened to AREA_MANAGER; all other admin routes remain ADMIN/SUPER_ADMIN.
- **Nav**: Already updated in prior pass; no further change.

---

## 5. Pages / Routes Fixed in This Audit

- **APIs**: executive (anomalies, compare, alerts, trends, yoy, month-snapshot), sales (import, monthly-sheet, yearly, preview, template, daily/lock, daily/lines, summary/targets, entry), approvals reject, admin (sales-edit-requests reject, reset-employee-targets, generate-employee-targets, boutique-target, employee-target, clear-sales-month), mobile dashboard targets source.
- **Pages**: sales/daily, admin/sales-edit-requests, sales/summary, executive/network.
- **Lib**: `lib/sales/ledgerRbac.ts` — AREA_MANAGER multi-boutique scope and canImport/canResolveIssues/canAddManualReturn.

---

## 6. Final Permission Matrix (Relevant to AREA_MANAGER)

| Area | EMPLOYEE | ASSISTANT_MANAGER | MANAGER | AREA_MANAGER | ADMIN | SUPER_ADMIN |
|------|----------|-------------------|---------|--------------|-------|-------------|
| Targets (view/edit/import) | No | View only | Scope (single) | Scope (multi) | Full | Full |
| Executive (all read) | No | No | Single boutique | Multi-boutique scope | Single or global | All / param |
| Sales summary / daily | No | Yes | Yes | Yes | Yes | Yes |
| Sales import / preview / template | No | Yes | Yes | Yes | Yes | Yes |
| Sales daily lock / lines | No | No | Yes | Yes | Yes | Yes |
| Sales entry (for others) | No | No | Yes (scope) | Yes (scope) | Yes | Yes |
| Import-issues (view/resolve) | No | Read-only | Yes (scope) | Yes (scope) | Yes | Yes |
| Approvals / reject | No | No | Yes | Yes | Yes | Yes |
| Admin targets / generate/reset/boutique/employee/clear-sales | No | No | Yes | Yes | Yes | Yes |
| Scope source | Single | Single | Single/selection | Membership (multi) | Single/global | All/param |
| Admin (users, system, audit, memberships, etc.) | No | No | No | No | Yes | Yes |

---

## 7. Scope Behavior Summary for AREA_MANAGER

- **Source**: UserBoutiqueMembership with `canAccess: true`. No global fallback.
- **getOperationalScope**: Returns `boutiqueIds = getUserAllowedBoutiqueIds(user.id)`, `boutiqueId` = first or session if in set.
- **getTrustedOperationalBoutiqueId**: Session boutique if in allowed set, else first allowed (used for sales write when a single “current” boutique is required).
- **getTargetsScope**: Same allowedBoutiqueIds from getOperationalScope; canView/canEdit/canImport true when role in ROLES_* and allowedBoutiqueIds.length > 0.
- **getSalesScope**: AREA_MANAGER gets allowedBoutiqueIds from op.boutiqueIds; canImport, canResolveIssues, canAddManualReturn true when allowedBoutiqueIds.length > 0; requestBoutiqueId must be in allowedBoutiqueIds.
- **Target import**: Only rows resolving to boutiques in scope.allowedBoutiqueIds are valid; apply writes only for those rows.

---

## 8. Remaining Risks / Assumptions

- **Sales daily/lines and lock**: AREA_MANAGER uses a single “trusted” operational boutique per request (session or first allowed). To act on another boutique they must switch context (e.g. scope selector if provided). No cross-boutique write in a single request.
- **Executive compare**: Global mode (`?global=true`) remains ADMIN/SUPER_ADMIN only; AREA_MANAGER sees only their scope via resolveExecutiveBoutiqueIds (operational scope).
- **Admin delegation routes**: Delegation list/create/revoke were not expanded to AREA_MANAGER in this audit; they remain MANAGER (own boutique) and ADMIN. If AREA_MANAGER should manage delegation for their area, a separate change would be needed.
- **Inventory / schedule / tasks**: No AREA_MANAGER-specific changes; behavior unchanged.
- **Assumption**: AREA_MANAGER is given membership (UserBoutiqueMembership) for each boutique they supervise; without it they have no scope.

---

## 9. Recommended Next Hardening Steps

1. **E2E / manual tests**: Log in as AREA_MANAGER with 2+ boutiques; confirm targets, executive, sales summary/daily, import, and approvals only show/allow data for those boutiques.
2. **Delegation**: Decide if AREA_MANAGER should manage delegation for their boutiques; if yes, add them to admin/delegations and related APIs with scope restricted to allowedBoutiqueIds.
3. **Central role lists**: Consider a single constant (e.g. `EXECUTIVE_VIEW_ROLES`, `SALES_IMPORT_ROLES`) in `lib/permissions.ts` or `lib/rbac.ts` and reuse in APIs to avoid future omissions.
4. **Audit log**: Ensure sensitive actions (target apply, sales import, approval reject) log actor role and scope for AREA_MANAGER.

---

## 10. Test Matrix (Verification)

- **A) SUPER_ADMIN**: Full access unchanged.
- **B) ADMIN**: Full operational/admin access unchanged.
- **C) AREA_MANAGER**: Can manage targets in scope; import/export targets in scope; access sales/analytics in scope; cannot access global admin-only pages; cannot modify outside scope (enforced by allowedBoutiqueIds and getSalesScope/getTargetsScope).
- **D) MANAGER**: Remains single-boutique / selection; no area-level multi-boutique.
- **E) ASSISTANT_MANAGER**: No target import/apply escalation; can view targets; sales import preview/template allowed (existing); resolve issues not granted in this audit.
- **F) EMPLOYEE / VIEWER**: No target management, no admin routes.
- **G) Mixed-scope import**: Target import validates against allowedBoutiqueIds; rows for other boutiques are invalid and reported in preview; apply does not write them.
