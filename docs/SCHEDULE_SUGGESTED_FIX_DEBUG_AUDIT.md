# Schedule “Suggested Fix” Warning Persistence — Debug Audit Report

**Date:** 2025  
**Scope:** Schedule Day Editor / Schedule Overview — “Suggested fix” or imbalance warning persists after edits; table shows correct AM/PM counts.  
**Goal:** Root cause with evidence, single source of truth, and minimal patch.

---

## 1) Root cause (one sentence)

**Primary:** On the Schedule Edit page, the suggestions list is computed from the **last fetched server grid** (`gridData.suggestions` / `grid.counts`), while the **table** shows **displayCounts** (server counts **plus** local pending edits and guest counts). So after you change a shift locally (or save and expect the card to update), the table reflects the draft/saved state but the warning still comes from server-side counts that may not yet include your edits — i.e. **two different data sources**: table = `displayCounts`; suggestions = `gridData.suggestions` from server `grid.counts`.

**Secondary (Dashboard “Schedule Overview”):** The “AM exceeds PM — imbalance highlighted” on the **Executive Dashboard** uses **today’s** roster only (`rosterForDate(now)`), and the dashboard is fetched once on load and not refetched when you navigate back from the Schedule Edit page, so it can show **stale** data until you refresh or refocus the tab.

---

## 2) Evidence — code pointers and data flow

### A) Warning UI locations

| Text / concept | File | Component / location |
|----------------|------|----------------------|
| “Schedule Overview” | `components/dashboard/sections/ScheduleOverviewSection.tsx` | `<OpsCard title="Schedule Overview">` |
| “AM exceeds PM — imbalance highlighted” | `components/dashboard/sections/ScheduleOverviewSection.tsx` (lines 22–23) | Rendered when `imbalanceHighlight === true` |
| “Suggested fix” / “Apply suggestion” | `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx` | Modal title (e.g. line ~1982); list from `gridData.suggestions` → now `effectiveSuggestions` |
| “Suggestions” list (Move AM→PM, Remove Rashid) | `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx` (lines ~1728–1808) | Week tab; uses `gridData.suggestions` (now `effectiveSuggestions`) |

- **Schedule Overview** (imbalance + days overloaded) = **Executive Dashboard** page; data from `GET /api/dashboard` → `scheduleOverview`.
- **Suggested fix / Apply suggestion** = **Schedule Edit** page (week view); data from `GET /api/schedule/week/grid?weekStart=...&suggestions=1` → `grid.suggestions`.

### B) Computation chain

**Dashboard “Schedule Overview” (imbalance + days overloaded):**

- **UI:** `ExecutiveDashboard.tsx` → `ScheduleOverviewSection.tsx` with `imbalanceHighlight`, `daysOverloaded`, `amPmBalanceSummary`.
- **Data:** `GET /api/dashboard` (no cache: `cache: 'no-store'` after fix).
- **API:** `app/api/dashboard/route.ts` (lines ~274–308, 454–458):
  - `rosterToday = rosterForDate(now, { boutiqueIds: [boutiqueId] })`
  - `coverageResults = validateCoverage(now, { boutiqueIds: [boutiqueId] })`
  - `imbalanceHighlight = rosterToday.amEmployees.length > rosterToday.pmEmployees.length`
  - `daysOverloaded = coverageResults.map(v => v.message)`
- **Roster:** `lib/services/roster.ts` → `rosterForDate(date, options)` → for each employee: `availabilityFor`, `effectiveShiftFor` (override or rotation). Counts AM/PM from that.
- **Coverage:** `lib/services/coverageValidation.ts` → `validateCoverage(date, options)` → uses `rosterForDate`; 1‑minute cache (see E below).

**Schedule Edit “Suggestions” (per-day fixes):**

- **UI:** `ScheduleEditClient.tsx` — week tab shows a “Suggestions” block and “Apply suggestion” modal.
- **Data:** `GET /api/schedule/week/grid?weekStart=...&scope=all&suggestions=1` with `cache: 'no-store'`.
- **API:** `app/api/schedule/week/grid/route.ts`:
  - `grid = await getScheduleGridForWeek(weekStart, options)`
  - If `suggestions=1`: `grid.suggestions = buildScheduleSuggestions(grid)`
- **Grid:** `lib/services/scheduleGrid.ts` → `getScheduleGridForWeek` builds `rows`/`cells` and `counts` from the same rows (WORK cells only; MORNING/EVENING = boutique).
- **Suggestions:** `lib/services/scheduleSuggestions.ts` → `buildScheduleSuggestions(grid)` uses `grid.counts` and `grid.rows` (same source as grid), **not** client-side draft counts.

**Table counts on Schedule Edit:**

- **Source:** `displayCounts` in `ScheduleEditClient.tsx` (lines ~711–718).
- **Definition:** If there are **draft** counts: `displayCounts = draftCounts + guestCountsByDay`; else `displayCounts = gridData.counts`.
- **Draft:** `draftCounts = computeCountsFromGridRows(gridData.rows, getDraftShift)` where `getDraftShift` applies `pendingEdits` (local unsaved changes).
- So: **table** = server counts **or** server + pending edits + guests; **suggestions** = server counts only → mismatch when there are local edits or when the user expects the card to reflect the same numbers as the table.

### C) Table counts vs warning counts

| Where | Counts source | Notes |
|-------|----------------|--------|
| Schedule Edit **table** (AM/PM rows) | `displayCounts` = `draftCounts` + `guestCountsByDay` when drafts exist, else `gridData.counts` | Same as what user sees in grid/excel. |
| Schedule Edit **suggestions** | `gridData.suggestions` from `buildScheduleSuggestions(grid)` using `grid.counts` | No `pendingEdits`; no re-run after local edits. |
| Dashboard **Schedule Overview** | `rosterToday` (AM/PM lengths) and `coverageResults` from `rosterForDate(now)` / `validateCoverage(now)` | Today only; dashboard not refetched when returning from Schedule Edit. |

So: **table** and **suggestions** can differ because suggestions are based on **last fetched** `grid.counts`, while the table uses **displayCounts** (which include draft and guests). After **save**, the client calls `fetchGrid()` so `gridData` (and thus `gridData.suggestions`) updates — unless the user is looking at **unsaved** edits, in which case the suggestion list is still from the previous server state.

### D) Instrumentation (temporary debug)

Debug logs are guarded by:

- **Server:** `process.env.DEBUG_SCHEDULE_SUGGESTIONS === '1'`
- **Client (Schedule Edit):** `process.env.NEXT_PUBLIC_DEBUG_SCHEDULE_SUGGESTIONS === '1'`

**Where:**

1. **`lib/services/roster.ts`** — inside `rosterForDate`: logs `date`, `boutiqueIds`, `amCount`, `pmCount`, `amEmpIds`, `pmEmpIds`.
2. **`lib/services/coverageValidation.ts`** — inside `validateCoverage`: logs `dateKey`, `boutiqueIds`, `amCount`, `pmCount`, `isFriday`.
3. **`lib/services/scheduleSuggestions.ts`** — inside `buildScheduleSuggestions` (per day): logs `date`, `dayIndex`, `isFriday`, `am`, `pm`, `effectiveMinPm`, and which rule fired (e.g. AM>PM, Friday AM).
4. **`app/api/dashboard/route.ts`** — when building `scheduleOverview`: logs `boutiqueId`, `date`, `amCount`, `pmCount`, `imbalanceHighlight`, `daysOverloaded`.
5. **`app/(dashboard)/schedule/edit/ScheduleEditClient.tsx`** — in `effectiveSuggestions` useMemo: logs `weekStart`, `displayCountsByDay`, `serverCountsByDay`, `rawSuggestionsCount`, `filteredSuggestionsCount` (client console when `NEXT_PUBLIC_DEBUG_SCHEDULE_SUGGESTIONS=1`).

**Example runtime values (conceptual):**

- After editing one cell AM→PM locally, client log might show:
  - `displayCountsByDay`: e.g. `[{ dayIndex: 0, am: 2, pm: 3 }, ...]` (draft: fixed).
  - `serverCountsByDay`: e.g. `[{ dayIndex: 0, am: 3, pm: 2 }, ...]` (still AM>PM).
  - `rawSuggestionsCount`: 1, `filteredSuggestionsCount`: 0 (suggestion hidden because displayCounts no longer has violation).

### E) Stale data / caching

- **Schedule Edit:** Fetches grid with `cache: 'no-store'`. After “Apply suggestion” or “Save”, `fetchGrid()` is called, so the server grid and its suggestions are refreshed. So **after save**, suggestions and table should align **unless** the suggestion list was not filtered by current displayCounts (fixed by `effectiveSuggestions`).
- **Dashboard:** Previously fetched once in `useEffect([])` and not refetched when returning from Schedule Edit. **Fix applied:** refetch on `visibilitychange` when document becomes visible, and use `cache: 'no-store'` for the dashboard request.
- **Coverage validation:** `validateCoverage` in `lib/services/coverageValidation.ts` uses a **1‑minute in-memory cache** (key: `dateKey` + `boutiqueIds`). So `daysOverloaded` can be stale for up to 1 minute. Schedule save flows (e.g. `scheduleApply`, overrides, leaves) already call `clearCoverageValidationCache()` where appropriate.

### F) Boutique scoping and inclusion

- **Dashboard:** `rosterForDate(now, { boutiqueIds: [boutiqueId] })` and `validateCoverage(now, { boutiqueIds: [boutiqueId] })` use the resolved `boutiqueId` (from session/scope). Only that boutique’s employees are counted; inactive are excluded via `buildEmployeeWhereForOperational`.
- **Schedule grid:** `getScheduleGridForWeek(weekStart, options)` uses `scheduleScope.boutiqueIds`; same scope as “Working on” boutique. Guest coverage (Rashid) is included in grid rows and in counts (rashidAm/rashidPm); suggestions use the same grid.

---

## 3) Fix — minimal patch steps

### Fix 1: Schedule Edit — suggestions aligned with table (done)

- **File:** `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx`
- **Change:** Introduce **displayCounts-based filtering** of suggestions:
  - Added `effectiveSuggestions` useMemo: same as `gridData.suggestions` but filtered so a suggestion is shown only if, for that day, **displayCounts** still has the violation (e.g. for MOVE: `displayCounts[i].amCount > displayCounts[i].pmCount` or Friday `am >= 1`; for REMOVE_COVER: `pm < effectiveMinPm || pm < am`).
  - Replaced all UI usages of `gridData.suggestions` in the suggestions block with `effectiveSuggestions` (condition, quick-fix buttons, list).
- **Effect:** Once you fix a day locally (or after save and refetch), the suggestion for that day disappears because the table and the suggestion list now use the same counts (displayCounts).

### Fix 2: Dashboard refetch when tab becomes visible (done)

- **File:** `components/dashboard/ExecutiveDashboard.tsx`
- **Change:** Extracted `fetchDashboard` with `cache: 'no-store'`; added a `visibilitychange` listener that calls `fetchDashboard()` when `document.visibilityState === 'visible'`.
- **Effect:** Returning to the dashboard tab after editing the schedule triggers a refetch so “Schedule Overview” (including imbalance and days overloaded) reflects the latest roster.

### Optional: Clear coverage cache on grid save

- `app/api/schedule/week/grid/save/route.ts` uses `applyScheduleGridSave` from `lib/services/scheduleApply.ts`, which already calls `clearCoverageValidationCache()`. No change needed.

---

## 4) Regression checks (5 bullets)

1. **Schedule Edit — local edit:** On week view, change one employee from AM to PM so that day’s AM/PM counts become balanced. The “Suggestions” list should no longer show a “Move 1 from AM → PM” for that day (without saving).
2. **Schedule Edit — after save:** Apply a suggestion or manually change a shift and save. Refetch runs; the suggestion for that day should disappear and the table should still show the same AM/PM numbers as the summary row.
3. **Dashboard — refocus:** Open Dashboard, note “Schedule Overview” (e.g. “AM 3 / PM 2” and “AM exceeds PM”). Open Schedule Edit, fix today’s roster (e.g. move one AM→PM) and save. Return to the Dashboard tab; it should refetch and update to the new AM/PM and no imbalance if fixed.
4. **Dashboard — boutique:** Switch “Working on” to another boutique; Dashboard should show that boutique’s roster and imbalance, not the previous one.
5. **Friday / min PM:** For a Friday, ensure no AM suggestion appears when the roster is PM-only; for Sat–Thu, ensure “PM &lt; 2” or “AM &gt; PM” suggestions appear only when displayCounts still violate, and disappear when the table shows compliant counts.

---

## 5) API routes and sample payloads

- **Dashboard:** `GET /api/dashboard` (no query). Response includes `scheduleOverview: { amPmBalanceSummary, daysOverloaded: string[], imbalanceHighlight: boolean }`. Scope comes from session (and optional `?b=` for super-admin).
- **Week grid (with suggestions):** `GET /api/schedule/week/grid?weekStart=YYYY-MM-DD&scope=all&suggestions=1`. Response: `{ weekStart, days, rows, counts, suggestions?: ScheduleSuggestion[] }`. `counts[i]` = `{ amCount, pmCount, rashidAmCount, rashidPmCount }` for that day.
- **Save changes:** `POST /api/schedule/week/grid/save` with body `{ reason: string, changes: [{ empId, date, newShift, originalEffectiveShift?, overrideId? }] }`. After success, client calls `fetchGrid()` so the next view uses updated `grid` and `suggestions`.

---

## 6) Checklist

- [x] Single primary root cause stated (suggestions from server counts, table from displayCounts; dashboard not refetched).
- [x] Evidence: file paths, function names, and runtime log points documented.
- [x] Minimal fix: `effectiveSuggestions` filter + dashboard refetch on visibility; no unrelated refactors.
- [x] Regression checks: 5 bullets for Schedule Edit (local + save), Dashboard (refocus, boutique), and Friday/min PM.

---

## 7) STRICT PATCH (Day Editor + Dashboard) — Summary

**Mismatch fixed:** Warning used server/API suggestion and cached coverage; table/roster showed displayed counts. Now both Day Editor and Week Editor gate the warning by the **same** effective counts the user sees.

**Changes applied:**

1. **Day Editor** (`app/(dashboard)/schedule/editor/ScheduleEditorClient.tsx`): Gate coverage suggestion by displayed AM/PM: `displayedAmCount` / `displayedPmCount` from `roster`; show suggestion only when `stillViolates` (Friday AM≥1 or Sat–Thu AM>PM) and refetch suggestion API after apply so state is fresh.
2. **Week Editor** (`app/(dashboard)/schedule/edit/ScheduleEditClient.tsx`): Already had `effectiveSuggestions` filter; added `router.refresh()` after successful save and after apply suggestion so server components refetch.
3. **Coverage cache** (`app/api/schedule/guests/route.ts`): Call `clearCoverageValidationCache()` after DELETE that deactivates a guest override so 1‑minute cache does not keep stale warnings. Week grid save and coverage apply already clear cache via `scheduleApply` / apply route.
4. **Dashboard** (`components/dashboard/ExecutiveDashboard.tsx`): Already uses `cache: 'no-store'` and refetches on `visibilitychange` when tab becomes visible.

**Manual test steps:**

- **a)** Day editor or week grid: change one AM→PM locally so counts become 2/2 → warning disappears immediately (gated by displayed counts).
- **b)** Save changes → warning stays correct; navigate away and back → data refetched, warning still correct (router.refresh + fetchGrid / refetch).
- **c)** After schedule save, switch to Dashboard tab → Schedule Overview reflects new balance without waiting 1 minute (visibility refetch + cache clear on save).
