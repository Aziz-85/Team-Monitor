# Next Development Plan (Prioritized)

**Generated:** 2025-02-14 | **Purpose:** Actionable checklist for next sprint(s).

---

## P0 — Scope Isolation & Data Correctness

- [x] **Audit all Prisma queries** for boutiqueId/scope filter on Employee, Sales, Schedule, Inventory
- [x] **Verify UserBoutiqueMembership** vs User.boutiqueId consistency for operational scope
- [ ] **Test cross-boutique leakage** — login as Manager boutique A, verify no data from boutique B (checklist in docs/audit/SCOPE_ENFORCEMENT.md)
- [x] **Document scope enforcement** per module (Schedule, Sales, Inventory, Tasks, Leaves)

**Files audited:** `lib/scope/*`, `app/api/**/route.ts`. **Fixes applied:** `/api/leaves` GET/POST now filter by operational boutique (employee.boutiqueId). Dashboard manager path: tasks, employees, zone runs, zone assignments, pending leaves count, rosterForDate, validateCoverage now scoped by boutiqueId. **Doc:** `docs/audit/SCOPE_ENFORCEMENT.md`

---

## P1 — Single-Source Endpoints & Cache

- [x] Add `cache: 'no-store'` to client fetch for: schedule grid, guests, week status, sales daily, tasks, inventory, leaves
- [x] Add `export const dynamic = 'force-dynamic'` to critical page routes if server-rendered (dashboard layout)
- [x] Add `force-dynamic` to schedule, inventory, tasks, leaves API routes
- [x] Decide: deprecate /schedule/editor or add nav link — added nav link "Schedule (day editor)" in OPERATIONS

**Files:** Client components with fetch(), `app/api/schedule/**`, `app/api/inventory/**`, `app/api/tasks/**`

---

## P2 — UI Consistency & Exports

- [x] Unify coverage label logic (coverageHeaderLabel) — extract to shared util (`lib/schedule/coverageHeaderLabel.ts`)
- [x] Verify all export flows (sales, planner, tasks) use correct scope (sales + sync/planner already scoped; planner/export + planner/export/schedule now use operational/schedule scope)
- [x] Audit date formatting (Asia/Riyadh) across schedule, sales, leaves — added `formatDateDisplayRiyadh` / `formatDateTimeDisplayRiyadh` in `lib/time`; leaves + tasks monitor use them

---

## P3 — Feature Activation & Cleanup

- [x] Add /admin/system-audit page (reads audit JSON) — optional, ADMIN only — added; reads docs/audit/*.md via GET /api/admin/audit-docs, nav "System Audit"
- [x] Remove or document /schedule/editor — documented in HIDDEN_FEATURES (now in nav since P1)
- [x] Grep for unused API endpoints; remove or document — documented in docs/audit/API_ENDPOINTS.md (no removals)
- [x] Clean up TODO/FIXME comments — grep found none in .ts/.tsx; only in docs (no code cleanup needed)

---

## Quick Reference

| Priority | Focus | Est. Effort |
|----------|-------|-------------|
| P0 | Scope isolation | 2–3 days |
| P1 | Cache + dynamic | 1 day |
| P2 | UI + exports | 1–2 days |
| P3 | Cleanup | 0.5–1 day |
