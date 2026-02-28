# Sales Boutique Isolation Audit Report

**Date:** 2026-02  
**Scope:** All sales & target flows — multi-boutique isolation by Employee.boutiqueId

---

## A) Route Inventory

### ADMIN Routes (global, may use AdminFilter)

| Route | Pass | Notes |
|-------|------|------|
| `app/api/admin/targets/route.ts` | ✓ | Admin; no operational scope |
| `app/api/admin/boutique-target/route.ts` | ✓ | Admin; global |
| `app/api/admin/employee-target/route.ts` | ✓ | Admin; global |
| `app/api/admin/generate-employee-targets/route.ts` | ✓ | Admin; global |
| `app/api/admin/reset-employee-targets/route.ts` | ✓ | Admin; global |
| `app/api/admin/role-weights/route.ts` | ✓ | Admin; global |
| `app/api/admin/clear-sales-month/route.ts` | ✓ | Admin; global |
| `app/api/admin/sales-import/route.ts` | ✓ | Admin; global |
| `app/api/admin/sales-edit-requests/[id]/approve/route.ts` | ✓ | Admin |
| `app/api/admin/sales-edit-requests/[id]/reject/route.ts` | ✓ | Admin |

### EXECUTIVE Routes (multi-boutique aggregation)

| Route | Pass | Notes |
|-------|------|------|
| `app/api/executive/route.ts` | ✓ | Executive scope; unchanged |
| `app/api/executive/insights/route.ts` | ✓ | Executive |
| `app/api/executive/monthly/route.ts` | ✓ | Executive |
| `app/api/executive/trends/route.ts` | ✓ | Executive |
| `app/api/executive/compare/route.ts` | ✓ | Executive |

### OPERATIONAL Routes (single operationalBoutiqueId)

| Route | Pass | Notes |
|-------|------|------|
| `app/api/sales/daily/route.ts` | ✓ | Uses getOperationalScope (fixed) |
| `app/api/sales/daily/summary/route.ts` | ✓ | Uses getOperationalScope (fixed) |
| `app/api/sales/daily/lines/route.ts` | ✓ | Uses getOperationalScope (fixed) |
| `app/api/sales/daily/lock/route.ts` | ✓ | Uses getOperationalScope (fixed) |
| `app/api/sales/import/route.ts` | ✓ | Fixed: getOperationalScope; boutiqueId must match |
| `app/api/sales/import/apply/route.ts` | ✓ | Fixed: getOperationalScope; batch.boutiqueId must match |
| `app/api/me/sales/route.ts` | ✓ | Fixed: boutiqueId from employee; write-path + read filter |
| `app/api/me/sales/[id]/route.ts` | ✓ | Fixed: boutiqueId assert on delete |
| `app/api/sales/daily/lines/route.ts` | ✓ | Fixed: assert employee.boutiqueId === boutiqueId |
| `app/api/me/sales/requests/route.ts` | — | TBD |
| `app/api/me/sales/request-edit/route.ts` | — | TBD |
| `app/api/me/targets/route.ts` | ✓ | User's own data by userId; optionally scope by boutique |
| `app/api/dashboard/route.ts` | — | May include sales; uses role-dependent logic |

---

## B) Data Model — boutiqueId Status

| Model | boutiqueId | Required | Indexed |
|-------|------------|----------|---------|
| BoutiqueSalesSummary | ✓ required | ✓ | ✓ |
| BoutiqueSalesLine | via summary | N/A | N/A |
| SalesEntry | optional | ✗ | ✓ |
| SalesImportBatch | required | ✓ | ✓ |
| BoutiqueMonthlyTarget | optional | ✗ | ✓ |
| EmployeeMonthlyTarget | optional | ✗ | ✓ |
| SalesEditGrant | optional | ✗ | ✓ |

---

## C) Violations & Fixes

### 1. Sales Import — DONE
- **File:** `app/api/sales/import/route.ts`
- **Fix:** Switched to `getOperationalScope`; boutiqueId must equal scope.boutiqueId

### 2. Sales Import Apply — DONE
- **File:** `app/api/sales/import/apply/route.ts`
- **Fix:** Switched to `getOperationalScope`; batch.boutiqueId must match scope.boutiqueId

### 3. /api/me/sales — DONE
- **File:** `app/api/me/sales/route.ts`
- **Fix:** POST sets boutiqueId from `getEmployeeBoutiqueIdForUser`; GET/DELETE filter by boutiqueId

### 4. /api/me/sales/[id] — DONE
- **File:** `app/api/me/sales/[id]/route.ts`
- **Fix:** DELETE asserts entry.boutiqueId matches employee.boutiqueId when both present

### 5. /api/sales/daily/lines — DONE
- **File:** `app/api/sales/daily/lines/route.ts`
- **Fix:** Assert employee.boutiqueId === boutiqueId before create/update line

---

## D) Manual Verification Checklist

- [ ] Switch operational boutique → Daily Sales Ledger shows only that boutique
- [ ] Employee dropdown in Daily Sales shows only operational boutique employees
- [ ] Sales import: boutiqueId must match operational boutique
- [ ] /me/sales: employee's own entries have correct boutiqueId
- [ ] Admin Targets: can view all (global)
- [ ] Executive: unchanged, aggregates across scope

---

## E) Files Touched (Fix Commit)

- `app/api/sales/import/route.ts` — getOperationalScope, boutiqueId validation
- `app/api/sales/import/apply/route.ts` — getOperationalScope, batch boutique validation
- `app/api/me/sales/route.ts` — boutiqueId on create/update, filter on read/delete
- `app/api/me/sales/[id]/route.ts` — boutiqueId assert on delete
- `app/api/sales/daily/lines/route.ts` — employee.boutiqueId === boutiqueId assert
- `lib/boutique/resolveOperationalBoutique.ts` — export getEmployeeBoutiqueIdForUser
