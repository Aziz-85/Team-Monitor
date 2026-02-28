# Phase A — Critical Fixes Summary (Team Monitor)

## A1) AM/PM Count Bug — Root Cause & Fix

**Where the bug was**
- **Server (API):** `lib/services/scheduleGrid.ts` already counted only when `cell.availability === 'WORK'` (correct).
- **Client:** In `app/(dashboard)/schedule/SchedulePageClient.tsx`, the `draftCounts` useMemo loop did **not** check availability. Cells with LEAVE / OFF / ABSENT but with an override (e.g. `effectiveShift: 'MORNING'`) were still included in AM/PM counts, causing wrong totals (e.g. Saturday mismatch).

**What was changed**
- In `SchedulePageClient.tsx`, inside the `draftCounts` useMemo, added:
  `if (cell.availability !== 'WORK') continue;`
  before using the draft shift to increment `counts[i].amCount` / `counts[i].pmCount`.
- Counts are now computed from the same logic as the API: only WORK cells contribute to AM/PM.
- **Unit tests** in `__tests__/schedule-counts.test.ts`:
  - **Case 1:** One cell with `availability: 'LEAVE'`, `effectiveShift: 'MORNING'` → AM count remains 0.
  - **Case 2:** Two cells with `availability: 'WORK'`, `effectiveShift: 'MORNING'` → AM count = 2 (increments).

**How to test manually**
1. Pick a week where someone is OFF or LEAVE but has an override to MORNING (or EVENING).
2. Open Schedule View (or Excel/Teams/Grid) and check daily AM/PM counts.
3. Confirm that person is **not** included in AM (or PM) count for that day.
4. Change the same person to WORK + MORNING and confirm AM count increases by 1.

---

## A2) Security Headers & CORS

**What was changed**
- **Removed:** Static-asset wildcard CORS header `Access-Control-Allow-Origin: *` from `next.config.mjs` (no strong reason to keep it).
- **Added** site-wide security headers (applied to `/:path*`):
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - **Content-Security-Policy** (minimal, Next.js–friendly):
    - `default-src 'self'`
    - `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    - `style-src 'self' 'unsafe-inline'`
    - `img-src 'self' data: blob:`
    - `font-src 'self' data:`
    - `connect-src 'self'`
    - `frame-ancestors 'none'`
    - `base-uri 'self'`
    - `form-action 'self'`

**How to test manually**
1. Run the app and open the schedule, login, and a few main pages.
2. Confirm scripts and styles load (no CSP errors in browser DevTools Console).
3. In DevTools → Network → select the document request → Response Headers: verify the above headers are present.

---

## A3) RBAC — Schedule Editor & Override APIs

**What was verified/changed**
- **Schedule View:** EMPLOYEE can access read-only view (`/schedule/view`) — already intended; no change.
- **Schedule Editor:** EMPLOYEE is blocked:
  - `/schedule/edit` — redirects to `/schedule/view` when `!canEditSchedule(user.role)` (existing).
  - `/schedule/editor` — now uses `canEditSchedule(user.role)` and redirects to `/schedule/view` (was redirecting to `/employee`).
- **Override write APIs:** POST/PATCH in `app/api/overrides/route.ts` and `app/api/overrides/[id]/route.ts` use `requireRole(['MANAGER','ASSISTANT_MANAGER','ADMIN'])`; EMPLOYEE receives 401/403.
- **Grid save:** `app/api/schedule/week/grid/save/route.ts` requires the same roles; EMPLOYEE cannot save.
- **Nav:** `lib/permissions.ts` — schedule editor link is only shown for roles that have `canEditSchedule` (MANAGER, ASSISTANT_MANAGER, ADMIN); EMPLOYEE does not see the editor link. Server-side checks remain the enforcement.

**How to test manually**
1. Log in as an **EMPLOYEE**.
2. Navigate directly to `/schedule/edit` and `/schedule/editor` — both must redirect to `/schedule/view` (or 403).
3. From the app, confirm the Schedule **Editor** link is not visible in the nav.
4. As EMPLOYEE, try to save an override (e.g. POST to overrides API or save from a hijacked request) — API must respond with 401/403.
5. Log in as MANAGER (or ASSISTANT_MANAGER / ADMIN) and confirm editor and save work.

---

## Manual Test Checklist (Phase A)

| # | Test | Expected |
|---|------|----------|
| 1 | Pick a week where someone is OFF/LEAVE but has an override to MORNING | AM count must **not** include that person. |
| 2 | Employee login: open `/schedule-editor` (or `/schedule/editor`) | Redirect to schedule view (or 403); no editor UI. |
| 3 | Employee: attempt to save overrides (e.g. POST overrides or grid save) | API returns 401/403; save fails. |
| 4 | App after security headers/CSP | App runs; no CSP errors in console; scripts/styles load. |

---

## Files Touched (Phase A)

- `app/(dashboard)/schedule/SchedulePageClient.tsx` — draftCounts skip non-WORK.
- `lib/services/scheduleGrid.ts` — no logic change; already WORK-only (reference).
- `__tests__/schedule-counts.test.ts` — two explicit count tests (LEAVE→0, WORK+MORNING→increment).
- `next.config.mjs` — removed wildcard CORS; added security headers + CSP.
- `app/(dashboard)/schedule/editor/page.tsx` — EMPLOYEE redirect via `canEditSchedule` to `/schedule/view`.

API routes for overrides and grid save were already role-protected; no code change there.
