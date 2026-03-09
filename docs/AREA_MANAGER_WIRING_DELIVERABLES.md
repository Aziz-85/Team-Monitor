# AREA_MANAGER Role — Wiring Deliverables

## 1. Whether AREA_MANAGER Already Existed or Was Added

**AREA_MANAGER already existed** in the project:
- Prisma `Role` enum (schema.prisma)
- `lib/permissions.ts` Role type and ROLE_ROUTES (minimal routes)
- `lib/roleLabel.ts` (adminEmp.roleAreaManager)
- `lib/rbac.ts` (AREA_MANAGER_ROLES, assertAreaManagerOrSuperAdmin)
- `lib/navConfig.ts` (area/employees, area/targets, about)
- `lib/mobileAuth.ts` (MOBILE_PERMISSIONS_BY_ROLE)

**Wiring completed** (was incomplete):
- Scope: AREA_MANAGER was not in SCOPE_FULL or operational scope; now gets multi-boutique from UserBoutiqueMembership.
- Targets: AREA_MANAGER was missing from ROLES_VIEW/EDIT/IMPORT and targets layout.
- Nav/Reports: AREA_MANAGER was missing from /targets, executive, sales summary, daily ledger, admin/targets, sales import, approvals, leaves.
- Permissions: ROLE_ROUTES for AREA_MANAGER expanded; canApproveWeek, canManageInBoutique, canManageSalesInBoutique, effectiveAccess approvals, admin/targets, executive/sales APIs updated.
- Admin: AREA_MANAGER added to membership and employee role options so admins can assign the role.

No new migration: enum unchanged.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `lib/scope/resolveScope.ts` | Added AREA_MANAGER to SCOPE_FULL |
| `lib/scope/operationalScope.ts` | Import getUserAllowedBoutiqueIds; getOperationalScope returns multi-boutique for AREA_MANAGER; getTrustedOperationalBoutiqueId supports AREA_MANAGER |
| `lib/scope/ssot.ts` | Use opScope.boutiqueIds (not single); requireBoutiqueScope allows multi when role === AREA_MANAGER |
| `lib/targets/scope.ts` | Added AREA_MANAGER to ROLES_VIEW, ROLES_EDIT, ROLES_IMPORT |
| `app/(dashboard)/targets/layout.tsx` | Added AREA_MANAGER to ALLOWED_ROLES |
| `lib/membershipPermissions.ts` | canManageInBoutique, canManageTasksInAny, canManageSalesInBoutique support AREA_MANAGER (membership-based) |
| `lib/boutique/resolveOperationalBoutique.ts` | Added AREA_MANAGER to CAN_SELECT_OPERATIONAL_BOUTIQUE |
| `lib/rbac/effectiveAccess.ts` | ROLE_ORDER: AREA_MANAGER between MANAGER and ADMIN; canApproveLeave/canApproveReq include AREA_MANAGER |
| `lib/permissions.ts` | canApproveWeek includes AREA_MANAGER; ROLE_ROUTES for AREA_MANAGER expanded (executive, targets, sales, leaves, approvals) |
| `lib/rbac/schedulePermissions.ts` | canApproveWeek includes AREA_MANAGER |
| `lib/navConfig.ts` | AREA_MANAGER added to targets, executive, sales summary, admin/targets, sales/daily, insights, compare, employees, sales import, approvals, leaves, boutique/leaves |
| `lib/sales-targets.ts` | canEditSalesForDate and canEnterSalesForOtherUser include AREA_MANAGER |
| `messages/ar.json` | roleAreaManager label set to "مدير منطقه" |
| `app/api/approvals/route.ts` | APPROVER_ROLES includes AREA_MANAGER |
| `app/api/executive/route.ts` | Role check includes AREA_MANAGER |
| `app/api/executive/monthly/route.ts` | Role check includes AREA_MANAGER |
| `app/api/sales/daily/route.ts` | DAILY_SALES_VIEW_ROLES includes AREA_MANAGER |
| `app/api/admin/sales-edit-requests/[id]/approve/route.ts` | APPROVER_ROLES includes AREA_MANAGER |
| `app/api/admin/targets/route.ts` | ADMIN_ROLES includes AREA_MANAGER |
| `app/api/admin/memberships/route.ts` | ROLES includes AREA_MANAGER; error message updated |
| `app/(dashboard)/executive/page.tsx` | Redirect allows AREA_MANAGER |
| `app/(dashboard)/executive/monthly/page.tsx` | Redirect allows AREA_MANAGER |
| `app/(dashboard)/executive/insights/page.tsx` | Redirect allows AREA_MANAGER |
| `app/(dashboard)/executive/compare/page.tsx` | Redirect allows AREA_MANAGER |
| `app/(dashboard)/executive/employees/page.tsx` | Redirect allows AREA_MANAGER |
| `app/(dashboard)/executive/employees/[empId]/page.tsx` | Redirect allows AREA_MANAGER |
| `app/(dashboard)/sales/import/page.tsx` | Redirect allows AREA_MANAGER |
| `app/(dashboard)/sales/import-issues/page.tsx` | Redirect allows AREA_MANAGER |
| `components/admin/MembershipEditor.tsx` | ROLES includes AREA_MANAGER |
| `app/(dashboard)/admin/employees/AdminEmployeesClient.tsx` | ROLES includes AREA_MANAGER |

---

## 3. Migration Name

None. AREA_MANAGER was already in the Prisma Role enum; no schema change.

---

## 4. Updated Permission Matrix

| Permission / Area | EMPLOYEE | ASSISTANT_MANAGER | MANAGER | AREA_MANAGER | ADMIN | SUPER_ADMIN |
|------------------|----------|-------------------|---------|--------------|------|-------------|
| Target module view | No | Yes | Yes | Yes | Yes | Yes |
| Target module edit/import | No | No | Yes (scope) | Yes (scope) | Yes | Yes |
| Executive / reports (scope) | No | No | Yes (single boutique) | Yes (multi-boutique area) | Yes (single or global) | Yes |
| Sales summary / daily | No | Yes | Yes | Yes | Yes | Yes |
| Sales import | No | Yes | Yes | Yes | Yes | Yes |
| Approvals / approve week | No | No | Yes | Yes | Yes | Yes |
| Leaves / boutique leaves | No | No | Yes | Yes | Yes | Yes |
| Area employees/targets | No | No | No | Yes | No | Yes |
| Scope | Single boutique | Single boutique | Single boutique / selection | Multi-boutique (membership) | Single or global | All / per-request |
| Admin (users, system, boutiques) | No | No | No | No | Yes | Yes |
| canManageSalesInBoutique | No | No | Yes (single op boutique) | Yes (any in membership) | Yes | Yes |
| canManageTasksInAny | No | No | Yes (membership) | Yes (membership) | Yes | Yes |

---

## 5. Updated Nav Visibility Summary

AREA_MANAGER now sees:
- **Dashboard**: /, /dashboard
- **Team**: /schedule/view, /approvals, /area/employees, /area/targets, /leaves, /boutique/leaves
- **Sales**: /sales/returns, /admin/import/sales, /sales/leadership-impact, /admin/sales-edit-requests, /me/target
- **Reports**: /executive, /executive/monthly, /executive/insights, /executive/compare, /executive/employees, /sales/summary, /admin/targets, **/targets** (target management), /sales/daily
- **Help**: /about

Not shown (admin-only): /admin/administration, /admin/users, /admin/audit, /admin/system, /admin/boutiques, /admin/regions, /admin/import, etc. Schedule edit is still MANAGER/ASSISTANT_MANAGER/ADMIN/SUPER_ADMIN only.

---

## 6. Scope Model Used for AREA_MANAGER

- **Source**: UserBoutiqueMembership with `canAccess: true`. All boutiques the user has access to form their “area”.
- **Resolution**: `getUserAllowedBoutiqueIds(userId)` in resolveScope; same used in operationalScope for AREA_MANAGER.
- **getOperationalScope**: For AREA_MANAGER returns `boutiqueIds: allowedIds` (all membership boutiques), `boutiqueId`: first or session boutique if in allowed set.
- **getTrustedOperationalBoutiqueId**: For AREA_MANAGER returns user.boutiqueId if in allowed set, else first allowed (for sales write validation).
- **resolveScope**: AREA_MANAGER in SCOPE_FULL so they can use REGION/GROUP/SELECTION and stored scope preference; filtered by membership.
- **SSOT**: When scope has multiple boutiqueIds and role is AREA_MANAGER, requireBoutiqueScope does not truncate to one (multi-boutique allowed for executive/reports).

---

## 7. Routes / Pages Now Accessible to AREA_MANAGER

- /targets, /targets/boutiques, /targets/employees, /targets/import (view, edit, import within scope)
- /executive, /executive/monthly, /executive/insights, /executive/compare, /executive/employees
- /sales/summary, /sales/daily
- /admin/import/sales, /admin/sales-edit-requests, /admin/targets
- /approvals, /leaves, /boutique/leaves
- /area/employees, /area/targets
- API: targets CRUD, template download, import preview/apply; executive; sales daily; approvals; admin/targets; sales-edit-requests approve (all scoped by allowed boutiques)

---

## 8. Assumptions / Limitations

- **Schedule edit**: AREA_MANAGER does not have schedule edit (SCHEDULE_EDIT_ROLES unchanged); can view schedule and approve week.
- **Executive “global”**: Only ADMIN/SUPER_ADMIN get ?global=true (all boutiques). AREA_MANAGER gets multiple boutiques only from membership, not global.
- **Admin assignment**: Only ADMIN/SUPER_ADMIN can assign AREA_MANAGER via admin/employees and admin/memberships; AREA_MANAGER is in role dropdowns.
- **Arabic label**: Display label set to "مدير منطقه" (ar.json roleAreaManager). En remains "Area Manager".
- **Backward compatibility**: MANAGER, ADMIN, SUPER_ADMIN, ASSISTANT_MANAGER, EMPLOYEE behavior unchanged; no privilege escalation.
