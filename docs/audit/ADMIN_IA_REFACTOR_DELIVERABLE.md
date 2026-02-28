# Admin IA Refactor — Deliverable

**Mode:** STRICT ADMIN IA REFACTOR (no feature changes, no DB changes, no theme redesign).

---

## 1) New Admin Sitemap (human readable)

### ADMINISTRATION
- Users & Roles → `/admin/users`
- Access / Permissions → `/admin/memberships`
- Audit Logs → `/admin/audit/login`, `/admin/system-audit`
- System Settings → `/admin/system`
- Version / Build Info → `/admin/system/version`
- Boutiques → `/admin/boutiques`
- Regions → `/admin/regions`
- Boutique Groups → `/admin/boutique-groups`
- Delegation → `/admin/control-panel/delegation`
- Employees → `/admin/employees`
- Reset Emp ID → `/admin/reset-emp-id`
- Reset Password → `/admin/reset-password`
- Coverage Rules → `/admin/coverage-rules`
- KPI Templates → `/admin/kpi-templates`

### IMPORT
- Import Dashboard → `/admin/import` (single entry point; card grid)
- Sales Imports → `/admin/import/sales` → redirects to `/sales/import`
- Targets / Month Snapshot → `/admin/import/month-snapshot`
- Historical Import → `/admin/import/historical`
- Import Issues → `/admin/import/errors` → redirects to `/sales/import-issues`
- Monthly Matrix → `/admin/import/matrix`

### SALES (unchanged; admin-relevant items)
- Targets → `/admin/targets`
- Sales edit requests → `/admin/sales-edit-requests`
- Sales Summary, Returns, Import, etc. → under existing SALES nav group

### HELP
- About → `/about`

---

## 2) Routes changed + redirects

| Old URL | New canonical / redirect |
|--------|---------------------------|
| `/admin/historical-import` | **Redirect (308)** → `/admin/import/historical` |
| `/admin/import/sales` | **Redirect (308)** → `/sales/import` |
| `/admin/import/errors` | **Redirect (308)** → `/sales/import-issues` |

**New routes (no redirect):**
- `/admin/import/historical` — Historical Import page (same capability as old historical-import).
- `/admin/import/matrix` — Monthly Matrix import form (moved from previous inline content on `/admin/import`).

---

## 3) Files modified (paths)

- `next.config.mjs` — Added 3 redirects.
- `lib/navConfig.ts` — Reordered ADMINISTRATION; added IMPORT group; removed import items from ADMINISTRATION.
- `lib/permissions.ts` — Added `/admin/system-audit` to ADMIN and SUPER_ADMIN in ROLE_ROUTES.
- `components/nav/Sidebar.tsx` — Added `IMPORT` to DEFAULT_OPEN_GROUPS.
- `components/admin/ImportSubpageLayout.tsx` — **New.** Breadcrumb + “Back to Import Dashboard” for import subpages.
- `app/(dashboard)/admin/import/AdminImportClient.tsx` — Replaced with card-only grid; matrix form removed.
- `app/(dashboard)/admin/import/MatrixImportClient.tsx` — **New.** Extracted matrix import form (logic unchanged).
- `app/(dashboard)/admin/import/page.tsx` — Unchanged (still server-protected, renders AdminImportClient).
- `app/(dashboard)/admin/import/month-snapshot/page.tsx` — Wrapped content with ImportSubpageLayout.
- `app/(dashboard)/admin/import/historical/page.tsx` — **New.** Renders HistoricalImportClient under ImportSubpageLayout.
- `app/(dashboard)/admin/import/matrix/page.tsx` — **New.** Renders MatrixImportClient under ImportSubpageLayout.
- `messages/en.json` — Added `nav.group.IMPORT`, `nav.admin.importSales`, `nav.admin.importErrors`, `nav.admin.importMatrix`.
- `messages/ar.json` — Same keys added with Arabic labels.
- `docs/audit/ADMIN_PAGES_MAP.md` — **New.** Pre-refactor admin pages map.
- `docs/audit/ADMIN_IA_REFACTOR_DELIVERABLE.md` — **New.** This file.

**Unchanged (deep links still work):**
- `app/(dashboard)/admin/historical-import/page.tsx` — Still exists; redirect in next.config sends `/admin/historical-import` → `/admin/import/historical`. (Optional: could remove the page and rely only on redirect; keeping it does not break anything.)

---

## 4) RBAC confirmations

- **ADMIN & SUPER_ADMIN:** All of `/admin/*` and `/admin/import/*` remain restricted to these roles. Server-side checks on `/admin/import`, `/admin/import/month-snapshot`, `/admin/import/historical`, `/admin/import/matrix` enforce `role === 'ADMIN' || role === 'SUPER_ADMIN'`; redirect to `/` or `/dashboard` otherwise.
- **MANAGER:** No new access. MANAGER still has `/admin/employees`, `/admin/targets`, `/admin/sales-edit-requests`, `/admin/control-panel/delegation`; no access to `/admin/import/*` (nav and route guard).
- **ROLE_ROUTES:** `/admin/import` is in ADMIN and SUPER_ADMIN; `canAccessRoute` allows any path under `/admin/import/` via prefix. `/admin/system-audit` added explicitly to ADMIN and SUPER_ADMIN.
- **Redirects:** `/admin/import/sales` and `/admin/import/errors` send users to `/sales/import` and `/sales/import-issues`, which keep their existing role rules (MANAGER+ and ASSISTANT_MANAGER+ respectively). No access loosened.

---

## 5) Verification checklist

- [x] Admin sidebar shows ADMINISTRATION and IMPORT as separate groups.
- [x] ADMINISTRATION ordered: Users, Memberships, Audit (login, system-audit), System, Version, then Boutiques, Regions, etc.
- [x] IMPORT group: Import Dashboard first, then Sales, Month Snapshot, Historical, Issues, Matrix.
- [x] `/admin/import` shows card grid only; each card links to the correct subpage or redirect.
- [x] `/admin/historical-import` redirects to `/admin/import/historical`; page loads and shows Historical Import with breadcrumb and “Back to Import Dashboard”.
- [x] `/admin/import/sales` and `/admin/import/errors` redirect to `/sales/import` and `/sales/import-issues`.
- [x] `/admin/import/month-snapshot` and `/admin/import/matrix` show breadcrumb “Import > …” and “Back to Import Dashboard”.
- [x] RBAC: non-admin cannot access `/admin/import/*` (server redirect).
- [x] Build passes (`npm run build`).
