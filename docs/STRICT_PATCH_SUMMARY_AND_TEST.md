# STRICT PATCH MODE — Boutique-Bound Login (Summary & Test Plan)

## Summary

- **Scope:** All data derived from `session user.boutiqueId`. No boutique selector. No admin boutique filter. Even ADMIN cannot switch boutiques without logging into another account.
- **Migrations:** `20260229000000_add_user_boutique_id`, `20260229000001_enforce_user_boutique_required`. Targets uniques were already in place (`20260214000001_targets_unique_boutique_month`).

---

## File-by-File Patch Summary

### Phase 0 — Discovery
- **docs/STRICT_PATCH_DISCOVERY.md** — Added: locations for auth, scope selector, admin filter, DEFAULT_BOUTIQUE_ID.

### Phase 1 — DB
- **prisma/schema.prisma** — Added `User.boutiqueId` (required), `User.boutique` relation, `@@index([boutiqueId])`. Added `Boutique.sessionUsers`.
- **prisma/migrations/20260229000000_add_user_boutique_id/migration.sql** — Add nullable `boutiqueId` + FK + index.
- **prisma/migrations/20260229000001_enforce_user_boutique_required/migration.sql** — Backfill from Employee → SystemConfig → first Boutique; then SET NOT NULL.

### Phase 2 — Auth session
- **app/api/auth/login/route.ts** — Include `boutique` in user fetch; block login with 403 if `!user.boutiqueId`; return `boutiqueId` and `boutiqueLabel` in response.
- **lib/auth.ts** — `getSessionUser()` includes `boutique: { id, name, code }`. `SessionUser` type includes `boutique?`.
- **app/api/auth/session/route.ts** — Response includes `boutiqueId` and `boutiqueLabel`.

### Phase 3 — Scope helpers
- **lib/scope/requireBoutiqueSession.ts** — New: returns `{ session: { userId, role, empId, boutiqueId, boutiqueLabel } }` or 401/403.
- **lib/scope/operationalScope.ts** — `getOperationalScope()` / `requireOperationalScope()` now use session `user.boutiqueId` and `user.boutique` only (no `resolveOperationalBoutiqueId`).
- **lib/scope/requireOperationalBoutique.ts** — Delegates to `requireOperationalScope()`; 403 message updated to "Account not assigned to a boutique".
- **lib/scope/effectiveBoutique.ts** — `resolveEffectiveBoutiqueId()` and `getEffectiveBoutiqueIdForRequest()` use `user.boutiqueId` only; `resolveEffectiveBoutique()` uses session user and `user.boutique`.

### Phase 4 — UI
- **app/api/me/operational-boutique/route.ts** — GET returns session boutique only, `canSelect: false`, `boutiques: []`. POST returns 403 (no switching).
- **components/scope/OperationalBoutiqueSelector.tsx** — Read-only label only; no dropdown, no POST.

### Phase 5 — Backend routes (session boutique only)
- **app/api/tasks/export-weekly/route.ts** — Always use `requireOperationalScope()`; removed ADMIN `boutiqueId` query param.
- **app/api/admin/targets/route.ts** — Use `user.boutiqueId` (session); removed `adminFilterBoutiqueId`; all targets/sales queries scoped by `sessionBoutiqueId`.
- **app/api/admin/generate-employee-targets/route.ts** — Use `user.boutiqueId`; removed `adminFilterBoutiqueId`.
- **app/api/admin/boutique-target/route.ts** — Use `user.boutiqueId` for POST/DELETE; removed `getDefaultBoutiqueId()`.
- **app/api/admin/employees/route.ts** — GET: filter by `[user.boutiqueId]`; POST: create employee with `sessionBoutiqueId`; removed admin filter params.
- **app/api/admin/users/route.ts** — GET: filter by `user.boutiqueId`; POST (create user): set `boutiqueId: creatingUser.boutiqueId`.
- **app/api/admin/sales/repair/route.ts** — Use `user.boutiqueId` only; ignore query/body `boutiqueId`.
- **app/api/admin/memberships/route.ts** — Use `[user.boutiqueId]`; removed admin filter.
- **app/api/kpi/uploads/route.ts** — GET/POST use `user.boutiqueId` only; removed `resolveScopeForUser` and query `boutiqueId`.

### Phase 6 — Cache
- No SWR key changes required: session is fixed per login, so `/api/*` responses are implicitly per-boutique. Removed selector state (Phase 4).

---

## Migrations Created

| Name | Purpose |
|------|---------|
| `20260229000000_add_user_boutique_id` | Add `User.boutiqueId` (nullable), index, FK to Boutique. |
| `20260229000001_enforce_user_boutique_required` | Backfill `User.boutiqueId` from Employee → SystemConfig → first Boutique; ALTER NOT NULL. |

Target uniques (`BoutiqueMonthlyTarget`, `EmployeeMonthlyTarget`) were already applied earlier.

---

## Confirmations

- **No boutique switch in UI:** OperationalBoutiqueSelector is read-only; POST /api/me/operational-boutique returns 403.
- **All admin routes scoped by session boutiqueId:** Admin targets, employees, users, memberships, sales/repair, boutique-target, kpi/uploads use `user.boutiqueId` only; query params for boutique are ignored.

---

## Manual Test Plan (Phase 7)

1. **Login as Boutique A admin**
   - Log in with a user whose `User.boutiqueId` = A.
   - Confirm banner shows "Working on: …" with Boutique A label (EN/AR as configured).

2. **Sales enter/lock**
   - Enter/lock daily sales for Boutique A.
   - Confirm monthly board and targets reflect achieved for A only.

3. **Tasks list/today**
   - Open tasks list and "my today"; confirm only tasks for Boutique A.

4. **Ignore boutiqueId in query**
   - Call an operational or admin API with `?boutiqueId=<other_boutique>`.
   - Confirm response is still for session boutique (A), not the param.

5. **Login as Boutique B (separate account)**
   - Log in with a different user bound to Boutique B.
   - Confirm banner shows B and all data (targets, tasks, sales) is for B.

6. **User with no boutiqueId cannot login**
   - If any user has `boutiqueId` null (should not exist after migration), or temporarily set one to null for test: attempt login → expect 403 "Account not assigned to a boutique".

7. **Optional: POST operational-boutique**
   - POST /api/me/operational-boutique with body `{ boutiqueId: "..." }` → expect 403.

---

## Quick Verification Commands

- Apply migrations (if not already): `npx prisma migrate deploy`
- Regenerate client: `npx prisma generate`
- Run app and run through test plan above.
