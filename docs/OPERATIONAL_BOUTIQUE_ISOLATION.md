# Operational Boutique Isolation

## Overview

Operational pages (schedule, tasks, inventory, leaves, sales/daily) use **exactly ONE boutique**. `Employee.boutiqueId` is the single source of truth for roster membership. No REGION/GROUP/SELECTION on operational pages.

## Verification Checklist

### 1. Admin pages: global list OK; filter via AdminFilter

- [ ] `/admin/employees` shows all employees (or filtered by AdminFilter BOUTIQUE/REGION/GROUP)
- [ ] Admin pages do NOT use operational boutique for employee lists
- [ ] AdminFilter is separate from operational boutique

### 2. Operational pages: switching boutique changes roster; no cross-boutique names

- [ ] Select Boutique S02 in sidebar → Schedule, Tasks, Inventory, Leaves show only employees with `Employee.boutiqueId = S02`
- [ ] Select Boutique S05 → Only S05 employees appear
- [ ] No employee from S02 appears when S05 is selected (and vice versa)

### 3. Employee list order stable across refresh (no jumping)

- [ ] Refresh Schedule (View) page 5 times → same employees in same columns/positions
- [ ] Switching boutique back and forth preserves consistent ordering
- [ ] Deterministic order: Team A first, then Team B; within team: name asc, empId asc

### 4. EMPLOYEE can’t switch boutique; sees only their boutique

- [ ] EMPLOYEE role: sidebar shows boutique label only (no dropdown)
- [ ] EMPLOYEE sees only employees from their `Employee.boutiqueId`
- [ ] ASSISTANT_MANAGER: same behavior (label only, forced to their boutique)

### 5. Schedule View shows only employees of selected boutique

- [ ] ADMIN/MANAGER: select boutique in sidebar → Schedule grid shows only that boutique’s employees
- [ ] Grid rows filtered by `Employee.boutiqueId = operationalBoutiqueId`
- [ ] No mixed-boutique names in AM/PM columns

## Implementation Summary

- **Resolver**: `lib/boutique/resolveOperationalBoutique.ts` → `resolveOperationalBoutiqueId(userId, role, requestedBoutiqueId?)`
- **API**: `GET/POST /api/me/operational-boutique` — current boutique + list + canSelect
- **Helper**: `lib/employees/getOperationalEmployees.ts` → `getOperationalEmployees(boutiqueId)`
- **Scope**: `lib/scope/operationalScope.ts` → `getOperationalScope()` returns single `boutiqueId`
- **Sidebar**: `OperationalBoutiqueSelector` — ADMIN/MANAGER: dropdown; EMPLOYEE/ASSISTANT_MANAGER: label only
- **Preference**: `UserPreference.operationalBoutiqueId` stores selection (ADMIN/MANAGER only)

## Migration

Run: `npx prisma migrate deploy` (or `prisma migrate dev`) to add `operationalBoutiqueId` to `UserPreference`.
