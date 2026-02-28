# Gap Analysis — Missing / Incomplete / Bugs

**Generated:** 2025-02-14 | **Purpose:** Identify what's missing, incomplete, or inconsistent.

---

## A) Missing / Incomplete Items

| Item | Evidence | Severity |
|------|----------|----------|
| Sales import "Apply" flow | Apply blocked = validation message when errors exist; apply is wired | ✅ Implemented |
| Schedule editor (alt) | /schedule/editor exists, not linked; different from /schedule/edit | P3 |
| Client fetch cache | Most fetch() calls lack cache: 'no-store' | P2 |
| Admin system-audit page | Not implemented (Phase 6 optional) | P3 |

---

## B) Bugs / Inconsistencies (From Code)

| Issue | Location | Risk |
|-------|----------|------|
| **Scope leaks** | All admin/scope code — verify boutiqueId filter on every query | P0 |
| **Employee scope mismatch** | Employee.boutiqueId vs UserBoutiqueMembership — ensure alignment | P0 |
| **Date boundary (UTC vs Asia/Riyadh)** | Sales, schedule use date strings; verify timezone handling | P1 |
| **Shift enum (AM/PM vs MORNING/EVENING)** | normShift, overrideShift — ensure consistent mapping | P1 |
| **Schedule week start** | Week starts Saturday (getWeekStartSaturday) — verify all APIs | P1 |

---

## C) Cross-Scope Leakage Risks

| Area | Mitigation | Status |
|------|------------|--------|
| Schedule grid | getScheduleScope() filters by boutiqueIds | ✅ |
| Guests | scope.boutiqueIds for host; employee.boutiqueId notIn scope | ✅ |
| Sales | boutiqueId in SalesEntry, DailySalesLedger | ✅ |
| Inventory | Zone/boutique scoping | Verify |
| Executive | Multi-boutique; admin sees all | ✅ |
| Admin employees | Filter by scope | Verify |

---

## D) Referenced but Unimplemented

| Reference | Location | Status |
|-----------|----------|--------|
| "Apply blocked" | Sales import validation message | ✅ Implemented (SalesImportClient.tsx, monthly-sheet route) |
| Email alerting | Security patch spec said "Do NOT email yet" | Not implemented (by design) |

---

## E) Duplicate Logic

| Duplication | Files | Recommendation |
|-------------|-------|----------------|
| Schedule week vs grid | /api/schedule/week, /api/schedule/week/grid | Document; consider deprecating /schedule/week for editor |
| Coverage label logic | ScheduleEditClient, ScheduleViewClient | Shared util? |
