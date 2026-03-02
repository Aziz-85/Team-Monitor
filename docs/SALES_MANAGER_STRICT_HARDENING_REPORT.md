# STRICT HARDENING PATCH — MANAGER Sales Permission (No Scope Escalation)

## 1. List of files changed

| File | Change |
|------|--------|
| `lib/scope/operationalScope.ts` | Added `getTrustedOperationalBoutiqueId(user, request)` — session-only for MANAGER/ADMIN; SUPER_ADMIN may use request for `?b=` |
| `lib/membershipPermissions.ts` | Renamed param `userOperationalBoutiqueId` → `trustedOperationalBoutiqueId`; MANAGER fail-closed: allow only when `trustedId != null && trustedId === targetBoutiqueId` |
| `app/api/sales/daily/summary/route.ts` | Use `getTrustedOperationalBoutiqueId`, validate `boutiqueId === trustedId`, pass `trustedId` to `canManageSalesInBoutique` |
| `app/api/sales/daily/lines/route.ts` | Same as summary |
| `app/api/sales/daily/lock/route.ts` | Same as summary |
| `app/api/sales/import/matrix/route.ts` | `checkAuth(boutiqueId, request)` uses `getTrustedOperationalBoutiqueId`, validates `boutiqueId === trustedId`, passes `trustedId` to `canManageSalesInBoutique` |
| `app/api/sales/import/apply/route.ts` | After `requireOperationalBoutique`, get `trustedId`, validate `scopeId === trustedId`, call `canManageSalesInBoutique(..., trustedId)` |
| `app/api/sales/import/yearly/route.ts` | Same as apply |
| `app/api/sales/entry/route.ts` | For MANAGER/ADMIN: get `trustedId`, require `scopeId === trustedId`; for MANAGER call `canManageSalesInBoutique(..., trustedId)` |
| `app/api/sales/returns/route.ts` | For MANAGER on POST: get `trustedId`, require `boutiqueId === trustedId`, call `canManageSalesInBoutique(..., trustedId)` |
| `__tests__/sales-ledger.test.ts` | Added tests: MANAGER + trustedId S02 allows S02, denies S01, denies when trustedId null/empty |

## 2. Final authorization rule

**MANAGER can manage sales only for their session operational boutique; scope preference does not grant rights.**

- **Trusted operational boutique** is computed by `getTrustedOperationalBoutiqueId(user, request)`:
  - **MANAGER / ADMIN:** strictly `user.boutiqueId` from session (no query, no stored preference).
  - **SUPER_ADMIN** with request: may use `?b=` / `X-Boutique-Code` (validated by UserBoutiqueMembership.canAccess).
- **canManageSalesInBoutique(userId, role, targetBoutiqueId, trustedOperationalBoutiqueId):**
  - **ADMIN / SUPER_ADMIN:** always allowed.
  - **MANAGER:** allowed only if `trustedOperationalBoutiqueId != null && trustedOperationalBoutiqueId === targetBoutiqueId` (fail-closed).
- Every sales write route validates that the target `boutiqueId` equals `trustedId` (for MANAGER) and passes `trustedId` into `canManageSalesInBoutique`.

## 3. No sales routes rely on scope preference

- **Grep verification:** No `scope?.boutiqueId` in `app/api/sales` or `lib` for sales authorization. All sales write routes use `getTrustedOperationalBoutiqueId(user, request)` and pass that value into `canManageSalesInBoutique`.
- **Stored preference:** `getStoredScopePreference` / `resolveScopeForUser` are used only in `lib/scope/ssot.ts` and `app/api/me/scope/route.ts`. Sales API routes do not use them for authorization.

## 4. Test added and passing

- **File:** `__tests__/sales-ledger.test.ts`
- **Added:** `describe('canManageSalesInBoutique (trusted operational boutique)')` with four tests:
  - MANAGER with `trustedOperationalBoutiqueId = 'S02'` allows target `'S02'` → true
  - MANAGER with `trustedOperationalBoutiqueId = 'S02'` denies target `'S01'` → false
  - MANAGER with `trustedOperationalBoutiqueId` null denies → false
  - MANAGER with `trustedOperationalBoutiqueId` empty string denies → false
- **Result:** `npx jest __tests__/sales-ledger.test.ts` — all 14 tests pass.

## 5. Verification commands (run and results)

- **`npm run typecheck`:** Fails due to pre-existing issue in `__tests__/sales-summary-targets.test.ts` (exports), not related to this patch.
- **`npm run build`:** Passes.
- **Grep: no bad patterns in sales**
  - `grep -RIn "scope\?\\.boutiqueId" app/api/sales lib` → No matches.
  - `grep -RIn "getStoredScopePreference|resolveScopeForUser" app/api/sales lib` → No matches in `app/api/sales`; only in `lib/scope` and `app/api/me/scope`.
  - `grep -RIn "canManageSalesInBoutique\\(" app/api/sales` → All 8 call sites pass `trustedId` (or equivalent) as the fourth argument.

## 6. Coverage summary

Sales write operations now using trusted operational boutique + `canManageSalesInBoutique(..., trustedId)`:

- Daily ledger: summary (POST), lines (POST), lock (POST)
- Import: matrix (POST), apply (POST), yearly (POST)
- Entry: POST (manual sales entry)
- Returns: POST (manual return/exchange)

No route uses `scope?.boutiqueId` or stored scope preference for sales authorization.
