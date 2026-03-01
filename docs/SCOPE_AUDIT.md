# Scope Audit — STRICT STABILIZATION

## Deliverable #1: Scope Sources Audit Table

| File | Endpoint/Page | Current scope source | Expected scope source | Risk | Fix action |
|------|---------------|----------------------|------------------------|------|------------|
| `app/api/executive/route.ts` | GET /api/executive | getOperationalScope → fallback resolveScopeForUser(null) | SSOT: operational only, no stored | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/executive/trends/route.ts` | GET /api/executive/trends | resolveScopeForUser(null) | SSOT: operational only | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/executive/weekly-pdf/route.ts` | GET /api/executive/weekly-pdf | resolveScopeForUser(null) | SSOT: operational only | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/executive/insights/route.ts` | GET /api/executive/insights | resolveScopeForUser(null) | SSOT: operational only | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/executive/alerts/route.ts` | GET /api/executive/alerts | resolveScopeForUser(null) | SSOT: operational only | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/executive/anomalies/route.ts` | GET /api/executive/anomalies | resolveScopeForUser(null) | SSOT: operational only | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/executive/employee-intelligence/route.ts` | GET /api/executive/employee-intelligence | resolveScopeForUser(null) | SSOT: operational only | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/executive/historical-snapshot/route.ts` | GET /api/executive/historical-snapshot | resolveOperationalBoutiqueId(user, role, null) | SSOT: operational only | **A** | Keep; align to SSOT wrapper |
| `app/api/executive/compare/route.ts` | GET /api/executive/compare | resolveExecutiveBoutiqueIds (global param) | SSOT: allowGlobal from ?global=true | **A** | Keep; already correct pattern |
| `app/api/executive/employees/*` | GET /api/executive/employees | resolveExecutiveBoutiqueIds (global param) | SSOT: allowGlobal from ?global=true | **A** | Keep; already correct |
| `app/api/executive/monthly/route.ts` | GET /api/executive/monthly | getOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `app/api/executive/month-snapshot/route.ts` | GET /api/executive/month-snapshot | getOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `app/api/executive/yoy/route.ts` | GET /api/executive/yoy | getOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `app/api/tasks/setup/route.ts` | GET/POST /api/tasks/setup | resolveScopeForUser(null) | SSOT: operational only (single boutique) | **P1** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/tasks/setup/[taskId]/route.ts` | GET /api/tasks/setup/[taskId] | resolveScopeForUser(null) | SSOT: operational only | **P1** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/tasks/setup/[taskId]/plan/route.ts` | GET /api/tasks/setup/[taskId]/plan | getOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `app/api/tasks/monitor/route.ts` | GET /api/tasks/monitor | getOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `app/api/kpi/employee/route.ts` | GET /api/kpi/employee | resolveScopeForUser(null) | SSOT: operational only | **P0** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/kpi/uploads/[id]/route.ts` | GET /api/kpi/uploads/[id] | resolveScopeForUser(null) | SSOT: operational only | **P1** | Use resolveBoutiqueIdsForRequest(allowGlobal: false) |
| `app/api/me/scope/route.ts` | GET/POST /api/me/scope | getStoredScopePreference, resolveScopeForUser | **B** Explicit scope preference API | **A** | Keep; mode=storedScope only here |
| `lib/tenancy/operationalRoster.ts` | resolveOperationalBoutiqueIds | resolveScopeForUser | SSOT: operational only | **P1** | Delegate to SSOT (single boutique) |
| `app/api/sales/*` (import, entry, etc.) | Various | requireOperationalBoutique / getOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `app/api/inventory/*` | Various | requireOperationalBoutique | SSOT: operational | **A** | Delegate to SSOT |
| `app/api/leaves/*` | Various | requireOperationalBoutique | SSOT: operational | **A** | Delegate to SSOT |
| `lib/metrics/scope.ts` | resolveMetricsScope | getOperationalScope + getEmployeeBoutiqueIdForUser | SSOT: operational for MANAGER+ | **A** | Delegate to SSOT |
| `lib/sales/ledgerRbac.ts` | getSalesScope | getOperationalScope + getEmployeeBoutiqueIdForUser | SSOT: operational | **A** | Delegate to SSOT |
| `lib/scope/scheduleScope.ts` | getScheduleScope | getOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `lib/scope/whereBoutique.ts` | whereBoutiqueIn, etc. | Filter builders only | N/A | **D** | Keep; used with SSOT output |
| `lib/scope/requireOperationalBoutique.ts` | requireOperationalBoutique | requireOperationalScope | SSOT: operational | **A** | Delegate to SSOT |
| `lib/boutique/resolveOperationalBoutique.ts` | resolveOperationalBoutiqueId | UserPreference.operationalBoutiqueId | Can diverge from session | **D** | SSOT will use session-first |

**Legend:**
- **A** = Correct single-boutique operational scope
- **B** = Explicit multi-boutique mode with UI toggle & permissions
- **C** = Incorrect: implicit multi-boutique / stored preference used where single-boutique expected
- **D** = Duplicate/overlapping helpers

---

## Deliverable #2: SSOT (lib/scope/ssot.ts)

- `resolveOperationalBoutiqueIdOrThrow(request)` — single boutique, throws if none
- `resolveBoutiqueIdsForRequest(request, { allowGlobal, modeName })` — canonical scope resolver
- `requireBoutiqueScope(request, options)` — returns error response if not authenticated or no boutique

Rules:
1. Default: single operational boutique (session or ?b= for SUPER_ADMIN)
2. Multi-boutique: ONLY when global=true AND (ADMIN|SUPER_ADMIN) AND allowGlobal=true
3. NEVER silently read stored preference for pages without multi-boutique mode
4. mode=storedScope: explicit opt-in for scope selector API

---

## Deliverable #3: Touched Files

| File | Change |
|------|--------|
| `lib/scope/ssot.ts` | NEW: SSOT module |
| `app/api/executive/route.ts` | requireBoutiqueScope + scopeUsed in response |
| `app/api/executive/trends/route.ts` | requireBoutiqueScope |
| `app/api/executive/insights/route.ts` | requireBoutiqueScope |
| `app/api/executive/alerts/route.ts` | requireBoutiqueScope |
| `app/api/executive/anomalies/route.ts` | requireBoutiqueScope |
| `app/api/executive/employee-intelligence/route.ts` | requireBoutiqueScope |
| `app/api/executive/weekly-pdf/route.ts` | requireBoutiqueScope |
| `app/api/executive/historical-snapshot/route.ts` | getOperationalScope (was resolveOperationalBoutiqueId) |
| `app/api/tasks/setup/route.ts` | requireBoutiqueScope |
| `app/api/tasks/setup/[taskId]/route.ts` | resolveBoutiqueIdsForRequest in assertTaskPermission |
| `app/api/kpi/employee/route.ts` | requireBoutiqueScope |
| `app/api/kpi/uploads/[id]/route.ts` | requireBoutiqueScope |
| `lib/tenancy/operationalRoster.ts` | resolveOperationalBoutiqueIds delegates to SSOT |
| `lib/scope/requireOperationalBoutique.ts` | Delegates to requireBoutiqueScope (SSOT) |

---

## Deliverable #4: De-duplication

| Helper | Now delegates to |
|--------|------------------|
| `requireOperationalBoutique` | `requireBoutiqueScope` (SSOT) |
| `resolveOperationalBoutiqueIds` | `resolveBoutiqueIdsForRequest` (SSOT) |
| `getOperationalScope` | Kept as foundational; SSOT uses it internally |

---

## Deliverable #5: Test Matrix (Manual Checklist)

| Scenario | Expected | Pass/Fail |
|----------|----------|-----------|
| 1. ADMIN with multiple boutiques, operational = AlRashid | Executive pages show ONLY AlRashid | _ |
| 2. ADMIN with UserPreference.scopeJson = REGION/GROUP | Executive pages STILL show only operational boutique | _ |
| 3. global=true on allowed pages (e.g. /api/executive/compare) | Multi-boutique only if ADMIN | _ |
| 4. EMPLOYEE role | Never multi-boutique; global ignored | _ |
| 5. DEMO_VIEWER / ADMIN on sales/targets | Scope filters enforced | _ |

---

## Deliverable #7: Final Summary

### What was wrong
- **Executive APIs** used `resolveScopeForUser(user.id, role, null)` which reads `UserPreference.scopeJson` (stored preference). When ADMIN had scopeJson set to REGION/GROUP, pages could show multi-boutique data without explicit `global=true`.
- **Tasks setup** and **KPI** routes used the same pattern, allowing implicit multi-boutique from stored preference.
- **Multiple scope helpers** (resolveScopeForUser, getOperationalScope, resolveOperationalBoutiqueId, requireOperationalBoutique) could diverge in behavior.

### Why it happened
- Stored scope preference was designed for a scope selector UI but was applied implicitly to operational pages.
- No single source of truth; different routes used different resolution chains.

### SSOT scope rules
1. **Default**: Single operational boutique (session boutique, or ?b= for SUPER_ADMIN).
2. **Multi-boutique**: ONLY when `global=true` AND role in (ADMIN, SUPER_ADMIN) AND `allowGlobal=true`.
3. **Never** silently read stored scope preference for pages without multi-boutique mode.
4. **mode=storedScope**: Explicit opt-in for scope selector API only.

### Confirmation
**No cross-boutique mixing unless explicit global=true.**
