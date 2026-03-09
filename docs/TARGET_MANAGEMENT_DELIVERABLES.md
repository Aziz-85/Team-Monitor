# Target Management Module — Deliverables

## Phase 1 — Discovery (Current State)

The Target Management module **already exists** in this project. Discovery confirmed:

- **Prisma:** `BoutiqueMonthlyTarget` and `EmployeeMonthlyTarget` exist with `source`, `notes`; unique constraints `(boutiqueId, month)` and `(boutiqueId, month, userId)`.
- **APIs:** Full CRUD for boutiques and employees; `GET /api/targets/scope`; template download (boutiques, employees); import preview and apply for both types. All use `getTargetsScope` / `requireTargetsView` / `requireTargetsEdit` / `requireTargetsImport` with `allowedBoutiqueIds`.
- **Pages:** `/targets`, `/targets/boutiques`, `/targets/employees`, `/targets/import` with layout role guard. Overview client, boutiques client, employees client, import client with template download, file upload, dry-run preview, and apply.
- **RBAC:** `lib/targets/scope.ts` defines ROLES_VIEW (MANAGER, ADMIN, SUPER_ADMIN, ASSISTANT_MANAGER, AREA_MANAGER), ROLES_EDIT and ROLES_IMPORT (MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER). ASSISTANT_MANAGER view only. AREA_MANAGER gets multi-boutique via `getOperationalScope().boutiqueIds`.
- **Import:** `lib/targets/importBoutiques.ts` and `importEmployees.ts` parse, validate, preview; apply uses transaction. Rows for boutiques not in `allowedBoutiqueIds` are rejected with "Boutique not in your scope".
- **Templates:** `lib/targets/templates.ts` builds xlsx with BOUTIQUE_TARGETS / EMPLOYEE_TARGETS sheets and README sheets; column order matches parser.
- **Nav:** `/targets` in navConfig for ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER.

No duplicate implementation was added. Only the following small enhancement was made:

- **Import page warning:** Added user-visible warning "Rows outside your boutique scope will be rejected" (en + ar) and displayed on `/targets/import`.

---

## Strict business rules (additional)

These rules are enforced and must not be relaxed:

1. **Boutique monthly target is the parent** for that boutique/month; it is the source of truth for the branch target.
2. **Employee monthly targets are child allocations** for the same boutique/month; they do not replace or override the boutique target.
3. **Do not force employee total to equal boutique target.** The system never silently adjusts employee targets (or boutique target) to make sums match. Import and CRUD store exactly what the user submits (validated for integer only).
4. **Show mismatch clearly.** When sum(employee targets) ≠ boutique target for a given month+boutique, the import preview shows a **sum mismatch warning** (amber box) with boutique sum and employee sum per (month, boutique). Apply is not blocked; the warning is informational.
5. **All target amounts are integer SAR only.** Schema uses `Int`; parsers reject decimals and non-integers; no rounding or coercion on write.
6. **Historical data remains stable.** Targets are stored by (boutiqueId, month, userId). If an employee later transfers or resigns, existing target rows are not moved or inferred from current boutique; historical rows stay valid for that month/boutique/employee.

Implementation: `lib/targets/importBoutiques.ts` and `importEmployees.ts` document these rules; sum mismatch is computed only for warnings; apply never modifies values to achieve balance. Prisma schema: `BoutiqueMonthlyTarget.amount` and `EmployeeMonthlyTarget.amount` are `Int`.

---

## 1. Files Created / Changed

### Created
- `lib/targets/scope.ts` — RBAC and scope (getTargetsScope, requireTargetsView/Edit/Import, allowedBoutiqueIds)
- `lib/targets/templates.ts` — Excel template generation (boutique + employee, README sheets)
- `lib/targets/importBoutiques.ts` — Parse, validate, apply boutique targets import
- `lib/targets/importEmployees.ts` — Parse, validate, apply employee targets import (with sum-mismatch warnings)
- `app/api/targets/scope/route.ts` — GET scope (canView, canEdit, canImport, boutiques)
- `app/api/targets/boutiques/route.ts` — GET list, POST create
- `app/api/targets/boutiques/[id]/route.ts` — GET, PUT, DELETE
- `app/api/targets/employees/route.ts` — GET list, POST create
- `app/api/targets/employees/[id]/route.ts` — GET, PUT, DELETE
- `app/api/targets/template/boutiques/route.ts` — GET download boutique template (xlsx)
- `app/api/targets/template/employees/route.ts` — GET download employee template (xlsx)
- `app/api/targets/import/boutiques/preview/route.ts` — POST FormData file → preview
- `app/api/targets/import/boutiques/apply/route.ts` — POST FormData file → apply (transaction)
- `app/api/targets/import/employees/preview/route.ts` — POST FormData file → preview
- `app/api/targets/import/employees/apply/route.ts` — POST FormData file → apply (transaction)
- `app/(dashboard)/targets/layout.tsx` — Role guard (ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER)
- `app/(dashboard)/targets/page.tsx` — Targets overview server page
- `app/(dashboard)/targets/TargetsOverviewClient.tsx` — Cards: Boutique Targets, Employee Targets, Import
- `app/(dashboard)/targets/boutiques/page.tsx` + `TargetsBoutiquesClient.tsx` — Boutique targets table, filters (year, month, boutique)
- `app/(dashboard)/targets/employees/page.tsx` + `TargetsEmployeesClient.tsx` — Employee targets table, filters
- `app/(dashboard)/targets/import/page.tsx` + `TargetsImportClient.tsx` — Template download, upload, dry-run, apply
- `prisma/migrations/20260336000000_add_target_source_notes/migration.sql` — Add source, notes to both target tables

### Changed
- `prisma/schema.prisma` — Added optional `source`, `notes` to `BoutiqueMonthlyTarget`; `EmployeeMonthlyTarget` already had them; ensured relations `boutique` / `boutiqueMonthlyTargets`, `employeeMonthlyTargets` for list APIs
- `lib/navConfig.ts` — Added `/targets` (nav.reports.targetsManagement) for ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER
- `messages/en.json` — New `targetsManagement` block and `nav.reports.targetsManagement`; added `outOfScopeRejected` for import warning
- `messages/ar.json` — Same i18n keys for targets module; added `outOfScopeRejected`
- `app/(dashboard)/targets/import/TargetsImportClient.tsx` — Display out-of-scope warning (`outOfScopeRejected`) in the import warnings block
- `docs/TARGET_MANAGEMENT_DELIVERABLES.md` — Phase 1 discovery section, AREA_MANAGER in layout/nav/RBAC, scope behavior §11, test checklist §12, Strict business rules section
- `lib/targets/importBoutiques.ts` — Docblock: parent/child, no forcing equality, integer SAR, mismatch warning-only
- `lib/targets/importEmployees.ts` — Docblock: same business rules; comment on sumMismatchWarnings (warning only, never force)

---

## 2. Prisma Changes

- **BoutiqueMonthlyTarget**: Added optional `source` (String?), `notes` (String?). Existing: `id`, `boutiqueId`, `month`, `amount`, `createdById`, `createdAt`, `updatedAt`, relations to `Boutique` and `createdBy` User. Unique: `(boutiqueId, month)`.
- **EmployeeMonthlyTarget**: Already had `source`, `notes` in schema; migration adds DB columns if they were missing. Existing: `id`, `boutiqueId`, `month`, `userId`, `amount`, plus generation/snapshot fields. Unique: `(boutiqueId, month, userId)`.
- **Boutique**: Relations `boutiqueMonthlyTargets` and `employeeMonthlyTargets` used by list APIs and include.

---

## 3. Migration Name(s)

- `20260336000000_add_target_source_notes` — Adds `source` and `notes` to `BoutiqueMonthlyTarget` and `EmployeeMonthlyTarget`.

---

## 4. Routes Added

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/targets/scope` | Scope (canView, canEdit, canImport, boutiques) |
| GET | `/api/targets/boutiques` | List boutique targets (query: year, month, boutiqueId) |
| POST | `/api/targets/boutiques` | Create boutique target |
| GET | `/api/targets/boutiques/[id]` | Get one boutique target |
| PUT | `/api/targets/boutiques/[id]` | Update boutique target |
| DELETE | `/api/targets/boutiques/[id]` | Delete boutique target |
| GET | `/api/targets/employees` | List employee targets (query: year, month, boutiqueId, userId) |
| POST | `/api/targets/employees` | Create employee target |
| GET | `/api/targets/employees/[id]` | Get one employee target |
| PUT | `/api/targets/employees/[id]` | Update employee target |
| DELETE | `/api/targets/employees/[id]` | Delete employee target |
| GET | `/api/targets/template/boutiques` | Download boutique targets Excel template |
| GET | `/api/targets/template/employees` | Download employee targets Excel template |
| POST | `/api/targets/import/boutiques/preview` | Preview boutique import (FormData file) |
| POST | `/api/targets/import/boutiques/apply` | Apply boutique import (FormData file, transaction) |
| POST | `/api/targets/import/employees/preview` | Preview employee import (FormData file) |
| POST | `/api/targets/import/employees/apply` | Apply employee import (FormData file, transaction) |

---

## 5. UI Pages Added

| Path | Description |
|------|-------------|
| `/targets` | Overview: cards to Boutique Targets, Employee Targets, Import |
| `/targets/boutiques` | Boutique monthly targets table; filters: year, month, boutique; CRUD + bulk import entry |
| `/targets/employees` | Employee monthly targets table; filters: year, month, boutique, employee; CRUD + validation vs boutique target |
| `/targets/import` | Download templates (boutique / employee), upload file, type selector, Dry Run, Confirm Apply, preview summary and invalid rows, sum-mismatch warnings |

Layout: role guard so only ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER can access `/targets/*`.

---

## 6. Import Rules Summary

- **Global**: Sheet name must be `BOUTIQUE_TARGETS` or `EMPLOYEE_TARGETS`; columns in exact order; mandatory fields non-empty; Month `YYYY-MM`; Target integer only; no negatives (unless project allows); no duplicate rows in file; blank trailing rows ignored; trim/normalize headers.
- **Boutique**: ScopeId must resolve to existing boutique; one row per boutique+month; upsert by (boutiqueId, month).
- **Employee**: Resolve employee by EmployeeCode first, then safe unique name fallback; ambiguous → fail row; historical/inactive/resigned allowed if in DB; one row per boutique+month+employee; upsert; sum(employee targets) vs boutique target for same month+boutique → warning only (no block).
- **Flow**: Upload → parse → validate → preview (dry run) → user confirms → apply in transaction; no write on upload; apply re-validates then writes.

---

## 7. Template Format Summary

**Boutique template**  
- Sheet `BOUTIQUE_TARGETS`: Month, ScopeId, BoutiqueName, Target, Source, Notes (order fixed).  
- Sheet `README`: Format, allowed ScopeIds (e.g. S05, S02), integer-only target, example rows, import rules.

**Employee template**  
- Sheet `EMPLOYEE_TARGETS`: Month, ScopeId, BoutiqueName, EmployeeCode, EmployeeName, Target, Source, Notes (order fixed).  
- Sheet `README`: Historical employees allowed; transferred/resigned rules; integer only; do not reorder columns or rename sheets; example rows.

Output: xlsx, server-generated.

---

## 8. RBAC Summary

- **SUPER_ADMIN / ADMIN**: Full access (view, edit, import) within all active boutiques (SUPER_ADMIN) or operational scope (ADMIN).
- **AREA_MANAGER**: View, edit, import only within assigned boutiques (allowedBoutiqueIds from UserBoutiqueMembership via getOperationalScope).
- **MANAGER**: View, edit, import only within operational boutique(s).
- **ASSISTANT_MANAGER**: View only; no edit, no import (canEdit/canImport false from `/api/targets/scope`).
- **EMPLOYEE / VIEWER / DEMO_VIEWER**: No target module access (403 on scope).

Page-level: layout guard restricts `/targets` to roles above. API-level: scope used in all target APIs; import apply/preview and template downloads require scope and canImport (or canView for template download as appropriate). Boutique-scope: list/filter and mutations restricted to `allowedBoutiqueIds`.

**AREA_MANAGER explicit requirements (verified):**
- Can open `/targets`, `/targets/boutiques`, `/targets/employees`, `/targets/import` (layout ALLOWED_ROLES + nav include AREA_MANAGER).
- Can download templates (GET template/boutiques, template/employees use requireTargetsImport; ROLES_IMPORT includes AREA_MANAGER).
- Can preview imports (POST import/boutiques/preview, import/employees/preview use requireTargetsImport + allowedBoutiqueIds).
- Can apply imports (POST import/boutiques/apply, import/employees/apply same; apply only writes within allowedBoutiqueIds).
- Can edit boutique and employee targets (ROLES_EDIT includes AREA_MANAGER; all PUT/DELETE and POST create check allowedBoutiqueIds).
- Can only see and modify boutiques inside allowedBoutiqueIds (getOperationalScope(AREA_MANAGER) returns getUserAllowedBoutiqueIds only; no global list).
- Must never gain unrestricted admin powers (SUPER_ADMIN branch returns all active boutiques; AREA_MANAGER never enters that branch).

---

## 9. Test Checklist

- **A) Boutique template download**: File downloads; sheet names `BOUTIQUE_TARGETS`, `README`; headers and README content correct.
- **B) Employee template download**: File downloads; sheet names `EMPLOYEE_TARGETS`, `README`; headers and README content correct.
- **C) Boutique import preview**: Valid file → correct preview; wrong sheet name → fail; wrong column order → fail; invalid month → fail; decimal target → fail; duplicate month+boutique → flagged.
- **D) Employee import preview**: Valid file → correct preview; resigned/inactive historical row resolves when valid; ambiguous employee → fail; decimal target → fail; duplicate month+boutique+employee → flagged; sum mismatch → warning.
- **E) Apply**: Inserts and updates correct; transaction safety; no duplicate corruption; counts returned.
- **F) Pages**: Filters work; create/edit/delete respect permissions; scoped users cannot access other boutiques; unauthorized users blocked.

---

## 10. Assumptions / Limitations

- Monthly target is the source of truth; yearly target is derived from monthly rows, not stored separately in this module.
- Scope IDs S05 (Dhahran), S02 (Rashid) are supported; template README and validation use existing boutique scope resolution.
- Employee resolution: EmployeeCode preferred; name fallback only when safe and unique; ambiguous rows fail.
- Historical data: Employee targets tied to boutique+month+employee; no assumption that current boutique = historical boutique; resigned/inactive employees allowed when present in DB.
- Sum of employee targets vs boutique target is validated for warning only; apply is not blocked.
- Build uses TypeScript without `downlevelIteration`; Set/Map iteration uses `Array.from()` where needed.
- Future analytics (Productivity, Pace vs Seasonality, Smart Forecast) are out of scope; target infrastructure is prepared for later consumption.

---

## 11. Scope Behavior for AREA_MANAGER

- **Source of scope:** `getOperationalScope(request)` returns `boutiqueIds = getUserAllowedBoutiqueIds(user.id)` (UserBoutiqueMembership with `canAccess: true`). No global fallback.
- **Target module:** `getTargetsScope` uses that list as `allowedBoutiqueIds`. All list/filter/create/update/delete and import preview/apply are restricted to these IDs.
- **Import:** Rows whose ScopeId resolves to a boutique not in `allowedBoutiqueIds` are added to `invalidRows` with message "Boutique not in your scope"; apply never writes them.
- **UI:** Boutique filter on `/targets/boutiques` and `/targets/employees` is populated from scope; only allowed boutiques can be selected.

---

## 12. Test Checklist (Verified)

- **A) Boutique template:** xlsx, sheet BOUTIQUE_TARGETS, headers and order, README sheet.
- **B) Employee template:** xlsx, sheet EMPLOYEE_TARGETS, headers and order, README sheet.
- **C) Boutique preview:** Valid file previews; wrong sheet/column order/month/decimal/duplicate/out-of-scope fail or flagged.
- **D) Employee preview:** Valid file previews; ambiguous/missing employee, decimal, duplicate, out-of-scope handled; sum mismatch warning.
- **E) Apply:** Transaction-safe; inserts/updates only for allowed scope; clear counts.
- **F) Page access:** AREA_MANAGER within scope; MANAGER per policy; ASSISTANT_MANAGER view only; EMPLOYEE/DEMO_VIEWER blocked.
- **G) UI/API alignment:** Buttons gated by canEdit/canImport from scope API; apply disabled until preview valid.
