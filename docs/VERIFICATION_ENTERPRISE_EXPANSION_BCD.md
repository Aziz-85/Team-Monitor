# Verification: Enterprise Expansion Pack (B + C + D)

## B) Cross-Boutique Executive Comparison

- [ ] **Route:** `/executive/compare` — ADMIN + MANAGER only; redirect others to `/dashboard`.
- [ ] **API:** `GET /api/executive/compare?month=YYYY-MM` returns 401/403 for non–ADMIN/MANAGER.
- [ ] **Scope:** API uses `resolveScopeForUser`; response only includes boutiques in `boutiqueIds`.
- [ ] **Response shape:** `{ month, boutiques: [...], regions: [...], groups: [...] }` with Sales (SAR), Target (SAR), Ach %, Overdue %, Risk Score per row.
- [ ] **Month selector:** Prev/next month; default current month.
- [ ] **Ranking table:** Boutique, Region, Sales (SAR), Target, Ach%, Overdue%, Risk Score; no horizontal scroll; truncate long names.
- [ ] **Region rollup:** Table with region, sales, target, ach%.
- [ ] **Group rollup:** Table when groups exist; group name, sales, target, ach%.
- [ ] **Top 3 / Bottom 3:** Cards show by achievement %.
- [ ] **Drilldown:** “Insights” link goes to `/executive/insights?boutiqueId=<id>`.
- [ ] **i18n:** EN/AR for compare title, table headers, cards, errors.

## C) Employee Annual Intelligence

- [ ] **Routes:** `/executive/employees` and `/executive/employees/[empId]` — ADMIN + MANAGER only.
- [ ] **API:** `GET /api/executive/employees/annual?year=YYYY` — scope resolved; sales from BoutiqueSalesLine filtered by `boutiqueId IN (allowed)`.
- [ ] **API:** `GET /api/executive/employees/[empId]?year=YYYY` — same scope; 404 if employee not found.
- [ ] **Annual total:** Per employee across all boutiques in scope (SAR integer).
- [ ] **Breakdown by boutique:** Shown in list and detail.
- [ ] **Monthly series:** 12 months for the year.
- [ ] **Achievement %:** Uses EmployeeMonthlyTarget when present (annual target sum vs annual sales); otherwise show "—".
- [ ] **Consistency score:** Derived (e.g. variance-based); displayed.
- [ ] **Top / bottom months:** Shown on detail page.
- [ ] **i18n:** EN/AR for employees title, table headers, labels, errors.

## D) Boutique Bootstrap Wizard (ADMIN)

- [ ] **Entry:** “Create with wizard” (or “Create Boutique (Wizard)”) on Admin Boutiques page — ADMIN only.
- [ ] **Step 1:** Boutique info — code, name, region, active (checkbox).
- [ ] **Step 2:** Assign manager — search/select user by empId or name.
- [ ] **Step 3:** Membership flags — canManageSales, canManageTasks, canManageLeaves (checkboxes).
- [ ] **Step 4:** Bootstrap options — create current month BoutiqueMonthlyTarget (optional amount in SAR).
- [ ] **Step 5:** Review and Create.
- [ ] **API:** `POST /api/admin/boutiques/bootstrap` — creates boutique, optional manager membership with flags, optional current month target; idempotent (duplicate code / existing membership no-op or error).
- [ ] **Audit:** BOUTIQUE_CREATED, BOUTIQUE_MANAGER_ASSIGNED, BOUTIQUE_BOOTSTRAPPED recorded.
- [ ] **i18n:** EN/AR for wizard steps and labels.

## General

- [ ] **No horizontal scroll:** Sidebar and all new tables use `min-w-0`, `truncate`, `overflow-hidden` where needed.
- [ ] **Light theme only.**
- [ ] **Money:** SAR integer only in APIs and display.
- [ ] **TypeScript:** Strict; no new `any` or lint errors.
