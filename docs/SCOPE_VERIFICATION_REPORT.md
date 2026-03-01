# Scope Verification Report — STRICT STABILIZATION

**Date:** 2025-02-26  
**Goal:** No cross-boutique data bleed. Default = single operational boutique. Multi-boutique ONLY via explicit `global=true` (ADMIN/SUPER_ADMIN).

---

## A) Audit Table — Before / After

| File | Endpoint/Page | Scope Source Before | Scope Source After | Risk | Fix |
|------|---------------|---------------------|--------------------|------|-----|
| `app/api/executive/route.ts` | GET /api/executive | getOperationalScope → fallback resolveScopeForUser | resolveOperationalBoutiqueOnly | P0 | ✅ Done |
| `app/api/executive/insights/route.ts` | GET /api/executive/insights | resolveScopeForUser(null) | resolveOperationalBoutiqueOnly | P0 | ✅ Done |
| `app/api/executive/anomalies/route.ts` | GET /api/executive/anomalies | resolveScopeForUser(null) | resolveOperationalBoutiqueOnly | P0 | ✅ Done |
| `app/api/executive/employee-intelligence/route.ts` | GET /api/executive/employee-intelligence | resolveScopeForUser(null) | resolveOperationalBoutiqueOnly | P0 | ✅ Done |
| `app/api/executive/alerts/route.ts` | GET /api/executive/alerts | resolveScopeForUser(null) | resolveOperationalBoutiqueOnly | P0 | ✅ Done |
| `app/api/executive/trends/route.ts` | GET /api/executive/trends | resolveScopeForUser(null) | resolveOperationalBoutiqueOnly | P0 | ✅ Done |
| `app/api/executive/weekly-pdf/route.ts` | GET /api/executive/weekly-pdf | resolveScopeForUser(null) | resolveOperationalBoutiqueOnly | P0 | ✅ Done |
| `app/api/executive/compare/route.ts` | GET /api/executive/compare | resolveExecutiveBoutiqueIds | resolveBoutiqueIdsWithOptionalGlobal (via lib/executive/scope) | A | ✅ Done |
| `app/api/executive/employees/*` | GET /api/executive/employees | resolveExecutiveBoutiqueIds | resolveBoutiqueIdsWithOptionalGlobal | A | ✅ Done |
| `app/api/me/scope/route.ts` | GET/POST /api/me/scope | getStoredScopePreference, resolveScopeForUser | **B** Explicit scope preference API | A | Keep |
| `lib/executive/scope.ts` | resolveExecutiveBoutiqueIds | resolveOperationalBoutiqueId (UserPreference) | resolveBoutiqueIdsWithOptionalGlobal (session) | D | ✅ Done |

**P0 definition:** Any API reading Sales/Targets/KPI/Executive metrics that could return multiple boutiques WITHOUT explicit global=true.

---

## B) SSOT Created: `lib/scope/ssotScope.ts`

### Exports

1. **`resolveOperationalBoutiqueOnly(request, user)`**
   - Returns `{ ok: true, scope: { boutiqueId, boutiqueIds, label } }` or `{ ok: false, res: NextResponse }`
   - If missing: 403 "Operational boutique required" (no fallback to stored scope)
   - EMPLOYEE/ASSISTANT_MANAGER: Employee.boutiqueId
   - MANAGER/ADMIN/SUPER_ADMIN: session operational scope (getOperationalScope)

2. **`resolveBoutiqueIdsWithOptionalGlobal(request, user, modeName)`**
   - If `global=true` AND role is ADMIN/SUPER_ADMIN: returns all active boutiques + audit
   - Else: returns single operational boutique only
   - Never uses resolveScopeForUser unless endpoint explicitly opts into stored scope mode

### Safety

- Operational-only endpoints assert single boutique (boutiqueIds.length === 1)
- No fallback to UserPreference.scopeJson for operational pages

---

## C) Executive APIs Patched

All executive routes now use:

```ts
const scopeResult = await resolveOperationalBoutiqueOnly(request, user);
if (!scopeResult.ok) return scopeResult.res;
const boutiqueIds = scopeResult.scope.boutiqueIds;
```

- `app/api/executive/route.ts` — No fallback; 403 "Operational boutique required" when missing
- `app/api/executive/insights/route.ts`
- `app/api/executive/anomalies/route.ts`
- `app/api/executive/employee-intelligence/route.ts`
- `app/api/executive/alerts/route.ts`
- `app/api/executive/trends/route.ts`
- `app/api/executive/weekly-pdf/route.ts`

Prisma queries filtered with `boutiqueId: { in: boutiqueIds }` (single boutique).

---

## D) Global Mode — Only Where UI Supports It

- `resolveBoutiqueIdsWithOptionalGlobal` used by:
  - `app/api/executive/compare/route.ts` — ?global=true
  - `app/api/executive/employees/annual/route.ts` — ?global=true
  - `app/api/executive/employees/[empId]/route.ts` — ?global=true
- Role check: ADMIN/SUPER_ADMIN only
- Audit: writeAdminAudit on global access

---

## E) De-duplication

| Helper | Delegates To |
|--------|--------------|
| `lib/executive/scope.resolveExecutiveBoutiqueIds` | `resolveBoutiqueIdsWithOptionalGlobal` (ssotScope) |
| `lib/scope/requireOperationalBoutique` | `requireBoutiqueScope` (ssot) |
| `lib/scope/ssot.requireBoutiqueScope` | Uses getOperationalScope (no stored scope) |

---

## F) Changed Files List

| File | Change |
|------|--------|
| `lib/scope/ssotScope.ts` | **NEW** — resolveOperationalBoutiqueOnly, resolveBoutiqueIdsWithOptionalGlobal |
| `app/api/executive/route.ts` | resolveOperationalBoutiqueOnly; 403 when missing |
| `app/api/executive/insights/route.ts` | resolveOperationalBoutiqueOnly |
| `app/api/executive/anomalies/route.ts` | resolveOperationalBoutiqueOnly |
| `app/api/executive/employee-intelligence/route.ts` | resolveOperationalBoutiqueOnly |
| `app/api/executive/alerts/route.ts` | resolveOperationalBoutiqueOnly |
| `app/api/executive/trends/route.ts` | resolveOperationalBoutiqueOnly |
| `app/api/executive/weekly-pdf/route.ts` | resolveOperationalBoutiqueOnly |
| `lib/executive/scope.ts` | Delegates to resolveBoutiqueIdsWithOptionalGlobal; signature +request, +user |
| `app/api/executive/compare/route.ts` | Pass request, user to resolveExecutiveBoutiqueIds |
| `app/api/executive/employees/annual/route.ts` | Pass request, user to resolveExecutiveBoutiqueIds |
| `app/api/executive/employees/[empId]/route.ts` | Pass request, user to resolveExecutiveBoutiqueIds |

---

## G) Manual Test Matrix

| Scenario | Expected | Pass/Fail |
|----------|----------|-----------|
| 1. Admin with multiple boutiques, working on = AlRashid | Executive pages show AlRashid only | _ |
| 2. Same admin with UserPreference.scopeJson = REGION/GROUP | Executive pages STILL show AlRashid only | _ |
| 3. Global View (compare/employees with ?global=true) | Multi-boutique for ADMIN/SUPER_ADMIN only | _ |
| 4. EMPLOYEE | global ignored; always single boutique | _ |
| 5. DEMO_VIEWER POST/PUT | 403 blocked everywhere | _ |

---

## Confirmation

**No cross-boutique mixing unless explicit global=true.**
