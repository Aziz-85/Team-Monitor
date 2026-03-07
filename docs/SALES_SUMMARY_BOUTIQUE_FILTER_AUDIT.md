# Sales Summary — Boutique filter audit and implementation plan

## 1. Audit findings

### 1.1 Why the page shows multiple boutiques

**Root cause: the summary API does not filter by boutique when `allowedBoutiqueIds` is empty.**

In `app/api/sales/summary/route.ts`:

- Scope is resolved via `getSalesScope({ requestBoutiqueId, request })` from `lib/sales/ledgerRbac.ts`.
- For **ADMIN / SUPER_ADMIN**, when `requestBoutiqueId` is not sent (client sends `boutiqueId: ''`):
  - `allowedBoutiqueIds = []` (comment: "empty = no filter = all boutiques").
  - `effectiveBoutiqueId = requestBoutiqueId || activeBoutiqueId` (so it’s the session boutique for display, but see below).
- The query is built as:
  - `if (scope.employeeOnly)` → filter by `userId` only (EMPLOYEE: own sales across boutiques).
  - `else if (scope.allowedBoutiqueIds.length > 0)` → set `whereBase.boutiqueId = scope.effectiveBoutiqueId`.
  - **When `allowedBoutiqueIds.length === 0` (ADMIN, no param), neither branch sets `boutiqueId`**, so the `SalesEntry` query has **no boutique filter** and returns **all boutiques**.

So:

- **MANAGER / ASSISTANT_MANAGER:** `allowedBoutiqueIds = [activeBoutiqueId]`, so the API filters by that one boutique. They should only see one boutique **unless** their session/operational scope is wrong.
- **ADMIN / SUPER_ADMIN** with no `boutiqueId` in the request: `allowedBoutiqueIds = []`, so the API returns **combined data for all boutiques**. That matches the reported behaviour when “operating inside one boutique” but the page doesn’t send a boutique (e.g. AlRashid in sidebar, Summary showing AlRashid + Dhahran).

The client currently initialises `boutiqueId` to `''` and never sets it from the user’s operational boutique or URL, so for ADMIN the API often receives no `boutiqueId` and returns all boutiques.

### 1.2 Current data flow

- **Page:** `app/(dashboard)/sales/summary/page.tsx` — server guard (ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN); renders `SalesSummaryClient` only; no props.
- **Client:** `SalesSummaryClient.tsx`:
  - State: `from`, `to`, `boutiqueId` (string), `summary`, `targets`, loading/error.
  - `boutiqueId` is initialised to `''` and only updated by a **free-text input** (placeholder "Boutique ID (ADMIN)").
  - No read from URL; no default from session/operational boutique; no dropdown of allowed boutiques.
  - `load()` and `loadTargets()` pass `boutiqueId` in query only when non-empty: `if (boutiqueId) params.set('boutiqueId', boutiqueId)`.
- **Summary API:** `GET /api/sales/summary?from=&to=&boutiqueId=` — uses `getSalesScope({ requestBoutiqueId, request })`; filters by `scope.effectiveBoutiqueId` only when `scope.allowedBoutiqueIds.length > 0`; otherwise no boutique filter (all boutiques).
- **Targets API:** `GET /api/sales/summary/targets?from=&to=&boutiqueId=` — same scope; then **403 for non–MANAGER/ADMIN/SUPER_ADMIN** (ASSISTANT_MANAGER gets 403 on targets). Uses `scope.effectiveBoutiqueId` for all queries (and requires a single `boutiqueId` for targets logic).

### 1.3 Scope helpers (relevant)

- **`lib/sales/ledgerRbac.ts` — `getSalesScope(options)`**
  - Returns `allowedBoutiqueIds`, `effectiveBoutiqueId`, `employeeOnly`, etc.
  - EMPLOYEE: `employeeOnly`, no boutique filter in summary (own rows across boutiques).
  - ASSISTANT_MANAGER / MANAGER: `allowedBoutiqueIds = [activeBoutiqueId]`, `effectiveBoutiqueId = activeBoutiqueId`; request param must match or 403.
  - ADMIN / SUPER_ADMIN: with `requestBoutiqueId` → single boutique; without → `allowedBoutiqueIds = []`, `effectiveBoutiqueId = activeBoutiqueId` (but summary API then applies no boutique filter).
- **`lib/scope/operationalScope.ts`** — `getOperationalScope(request)` used by sales scope for active boutique (session; SUPER_ADMIN can override via `?b=`).
- **`/api/me/operational-boutique`** — returns current session boutique (read-only).
- **`/api/me/boutiques`** — returns boutiques from `UserBoutiqueMembership` (for dropdown).

### 1.4 Role behaviour (to preserve)

- **EMPLOYEE:** Not allowed on Sales Summary page (redirect). No change.
- **ASSISTANT_MANAGER:** One operational boutique (employee’s boutique). Should see one boutique only; no selector or disabled single option.
- **MANAGER:** One operational boutique (session). Same: one boutique, selector hidden or single option.
- **ADMIN / SUPER_ADMIN:** Can have multiple boutiques (membership). Need selector; default to operational/session boutique so the first load is one boutique; optional “All” only if we explicitly add it and keep API behaviour safe.

### 1.5 Targets API and ASSISTANT_MANAGER

- `targets` route allows only MANAGER, ADMIN, SUPER_ADMIN. ASSISTANT_MANAGER gets 403. The Summary page allows ASSISTANT_MANAGER; they already see targets fail (or no targets). No change to API in this task.

---

## 2. Files to change

| File | Change |
|------|--------|
| `app/(dashboard)/sales/summary/page.tsx` | Optional: pass initial default `boutiqueId` from server (e.g. from getSalesScope or operational scope) so client can hydrate. Alternatively client fetches scope on mount; preferred to keep page minimal and do everything in client. |
| `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` | (1) Read `boutiqueId` from URL search params and sync state; (2) Default `boutiqueId` to user’s operational boutique (fetch `/api/me/operational-boutique` or a small scope endpoint) when param absent; (3) Replace free-text boutique input with a dropdown fed by `/api/me/boutiques`, only for roles that can have multiple boutiques (or show single boutique for MANAGER/ASSISTANT_MANAGER); (4) On boutique change, update URL and refetch summary + targets; (5) Validate: if URL has invalid boutique for role, reset to allowed default. |
| `app/api/sales/summary/route.ts` | When role is ADMIN/SUPER_ADMIN and `requestBoutiqueId` is empty, **do not** treat as “all boutiques”. Default to session/operational boutique (e.g. set `effectiveBoutiqueId` to `activeBoutiqueId` and apply it in the query so one-boutique is the default). Optionally support an explicit “all” only via a separate param and only for ADMIN if product wants it. |
| `messages/en.json` | Add/label e.g. `sales.summary.boutique` = "Boutique", keep or adjust placeholder. |
| `messages/ar.json` | Same key, Arabic. |

No DB schema or other API contract changes.

---

## 3. Implementation plan

### Step 1 — API: default to one boutique for ADMIN when no param

- In `getSalesScope`, when role is ADMIN/SUPER_ADMIN and `requestBoutiqueId` is empty, keep current behaviour (allowedBoutiqueIds = [], effectiveBoutiqueId = activeBoutiqueId) **but** in the summary route only: when `allowedBoutiqueIds.length === 0`, still set `whereBase.boutiqueId = scope.effectiveBoutiqueId` so we never run without a boutique filter. That way ADMIN without a chosen boutique sees their session/operational boutique only, not all.
- Alternative: in `ledgerRbac` when role is ADMIN and no requestBoutiqueId, set allowedBoutiqueIds = [activeBoutiqueId] and effectiveBoutiqueId = activeBoutiqueId so “no param” = “default to operational”. Then summary and targets both naturally filter by that one boutique. Prefer this so behaviour is consistent and the client can rely on “no param” = operational boutique.

### Step 2 — Client: URL and default boutique

- Use `useSearchParams()` (or router.query) to read `boutiqueId` (and keep `from`, `to`).
- On mount: if `boutiqueId` is not in URL, fetch default (e.g. GET `/api/me/operational-boutique`) and set state + replace URL to `?from=&to=&boutiqueId=<id>` so first load and refresh both use one boutique.
- When user changes boutique in the selector, set state and `router.replace` (or `window.history.replaceState`) to update `boutiqueId` in URL; then call `load()` and `loadTargets()`.

### Step 3 — Client: boutique selector

- Fetch allowed list: GET `/api/me/boutiques` (returns boutiques by membership).
- If list length is 0 or 1: show a single disabled or read-only “Boutique: {label}” (from operational-boutique or first item).
- If list length > 1 (typically ADMIN/SUPER_ADMIN): show `<select>` with options from `/api/me/boutiques`; value = `boutiqueId`; label = name/code; current value from state (synced with URL).
- Never send a `boutiqueId` that is not in the allowed list (validate on load from URL and when changing selection).

### Step 4 — Role safety

- EMPLOYEE: not on page (server redirect). No change.
- ASSISTANT_MANAGER / MANAGER: only one boutique in `/api/me/boutiques` (or operational-boutique). Default to it; hide or disable selector.
- ADMIN / SUPER_ADMIN: can have multiple; selector visible; default = operational boutique; URL param validated against allowed list, else fallback to operational.

### Step 5 — Empty state

- If summary/targets return empty for the chosen boutique/date range, keep current layout and show a short “No data for this period/boutique” message.

---

## 4. Diff preview (summary)

- **`app/api/sales/summary/route.ts`:** When `scope.allowedBoutiqueIds.length === 0` (ADMIN no param), set `whereBase.boutiqueId = scope.effectiveBoutiqueId` so we always filter by at least the operational boutique (no “all boutiques” unless we add an explicit “all” later).
- **`lib/sales/ledgerRbac.ts` (optional, preferred):** When role is ADMIN/SUPER_ADMIN and `requestBoutiqueId` is empty, set `allowedBoutiqueIds = [activeBoutiqueId]` and `effectiveBoutiqueId = activeBoutiqueId` so “no param” means “default to operational boutique” everywhere.
- **`SalesSummaryClient.tsx`:** Add URL sync (read/write `boutiqueId`, `from`, `to`); on mount set default boutique from `/api/me/operational-boutique` if not in URL; replace text input with dropdown from `/api/me/boutiques`; validate URL param against allowed list; refetch on boutique/date change.
- **`messages`:** Add `sales.summary.boutique` (and optional `sales.summary.boutiqueAll`) for labels.

---

## 5. Rollback

- Revert API change: allow again `allowedBoutiqueIds.length === 0` with no boutique filter for ADMIN.
- Revert client: restore free-text boutique input and remove URL sync and dropdown.
- No DB or other API changes.

---

## 6. Implementation completed

- **`lib/sales/ledgerRbac.ts`:** When role is ADMIN/SUPER_ADMIN and no `requestBoutiqueId` is sent, `allowedBoutiqueIds` is now `[activeBoutiqueId]` (when `activeBoutiqueId` is set) instead of `[]`, so the summary API always filters by at least the operational boutique.
- **`app/(dashboard)/sales/summary/SalesSummaryClient.tsx`:** URL sync for `from`, `to`, `boutiqueId`; default boutique from `/api/me/operational-boutique` and allowed list from `/api/me/boutiques`; boutique dropdown (disabled when only one allowed); validation of URL `boutiqueId` against allowed list; empty-state message when no data for period/boutique.
- **`messages/en.json` and `messages/ar.json`:** Added `sales.summary.boutique` (Boutique / البوتيك) and `sales.summary.noDataForPeriod` for empty state.
