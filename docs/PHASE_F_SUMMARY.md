# Phase F — Governance, Locking & Audit (Verification Summary)

This document confirms that Phase F requirements are implemented and where they live in the codebase.

---

## F1) Locking (DAY / WEEK) — CORE ✅

| Requirement | Implementation |
|-------------|----------------|
| Lock scopes: DAY, WEEK (Saturday→Friday) | `ScheduleLock` model: `scopeType` DAY \| WEEK, `scopeValue` = YYYY-MM-DD. `lib/services/scheduleLock.ts`: `getWeekStart`, `isDayLocked`, `isWeekLocked`, `lockDay`, `unlockDay`, `lockWeek`, `unlockWeek`. |
| Locked day → read-only | `checkLockForChanges(dates)` used in `/api/schedule/week/grid/save`, `/api/overrides`, `/api/overrides/[id]`, `/api/suggestions/coverage/apply`. Returns 403 with message. |
| Locked week → entire week read-only | Same `checkLockForChanges`: checks week lock first for all dates in the change set. |
| Server-side enforcement | All write APIs call `checkLockForChanges` before applying changes. |
| ASSISTANT_MANAGER / MANAGER: Lock/unlock DAY only | `canLockUnlockDay`, `canLockDay`, `canUnlockDay` in `lib/permissions.ts` and `scheduleLock.ts`. Day lock API checks role. |
| ADMIN: Lock/unlock DAY and WEEK | `canLockWeek`, `canUnlockWeek` → ADMIN only. Week lock/unlock API: `requireRole(['ADMIN'])`. |
| Locked viewable by everyone; not editable by anyone except ADMIN (unlock) | Edit UI disables save when `isWeekLocked` or day locked; no “edit when locked” path. Only unlock actions (ADMIN for week, ASSISTANT_MANAGER+ for day). |

---

## F2) Approval Flow ✅

| Requirement | Implementation |
|-------------|----------------|
| Week status: DRAFT (default) / APPROVED | `ScheduleWeekStatus` model. `getWeekStatus(weekStart)` in `scheduleLock.ts`. |
| Only APPROVED weeks can be WEEK-locked | `lockWeek()` throws `WEEK_NOT_APPROVED` if `getWeekStatus(weekStart).status !== 'APPROVED'`. API returns 400 with message. |
| Unlock APPROVED week → ADMIN only, revert to DRAFT | `unlockWeek()` in `scheduleLock.ts`: deletes week lock, upserts `ScheduleWeekStatus` to DRAFT. DELETE `/api/schedule/lock/week` requires ADMIN. |
| UI: DRAFT / APPROVED badge always visible | Schedule Edit: status badge (grey DRAFT / green APPROVED) + Locked badge (red) when week locked. |
| “Approve Week” (Manager + Admin) | `canApproveWeek(role)` → MANAGER, ADMIN. Button in Schedule Edit; POST `/api/schedule/approve-week`. |

---

## F3) Audit Log & Timeline ✅

| Requirement | Implementation |
|-------------|----------------|
| Every change creates audit record | `logAudit()` in `lib/audit.ts`. Used by: grid save, lock day/week, unlock day/week, approve week, team change, overrides, coverage apply. |
| Events: override add/update/remove, coverage, day/week lock/unlock, week approved, team change | Actions: `SCHEDULE_BATCH_SAVE`, `OVERRIDE_CREATE`, `OVERRIDE_UPDATE`, `COVERAGE_SUGGESTION_APPLY`, `DAY_LOCKED`, `DAY_UNLOCKED`, `WEEK_LOCKED`, `WEEK_UNLOCKED`, `WEEK_APPROVED`, `TEAM_CHANGE`, `TEAM_CHANGED`. |
| Actor, timestamp, action, before→after, reason | `AuditLog`: `actorUserId`, `createdAt`, `action`, `beforeJson`, `afterJson`, `reason`. API returns actor name/role. |
| Audit Timeline sidebar in Schedule Edit (current week) | Schedule Edit fetches `GET /api/audit?limit=20&weekStart={weekStart}`; sidebar “Audit (this week)” with last 10 entries + “View full audit →”. |
| Global Audit page: filter by date, employee, actor, action | `/schedule/audit`: filters `weekStart`, `dateFrom`, `dateTo`, `employee`, `actor`, `actionType`. `GET /api/audit` supports all. |

---

## F4) Role Governance ✅

| Role | Behaviour | Enforcement |
|------|-----------|-------------|
| EMPLOYEE | View schedule only | No edit/audit routes in `ROLE_ROUTES`. `canEditSchedule` false → redirect from `/schedule/edit` and `/schedule/audit`. APIs use `requireRole` (edit/audit not for EMPLOYEE). |
| ASSISTANT_MANAGER | Edit, coverage, lock/unlock DAY, view audit | `SCHEDULE_EDIT_ROLES`, `canLockUnlockDay`, `canApproveWeek` false. Schedule edit + audit pages and APIs. |
| MANAGER | Same + Approve week | `canApproveWeek` true. Approve-week API allows MANAGER. |
| ADMIN | Full; lock/unlock WEEK; unlock approved weeks | `canLockWeek`, `canUnlockWeek` true. Week lock/unlock APIs require ADMIN. |

UI: Schedule Edit shows/hides lock/approve buttons via `canLockUnlockDay`, `canLockWeek`, `canUnlockWeek`, `canApproveWeek(initialRole)`. API: `requireRole` and permission checks on each route.

---

## F5) Safe Editing Guarantees ✅

| Requirement | Implementation |
|-------------|----------------|
| Locked schedule: banner “This schedule is locked” | Schedule Edit: `tab === 'week' && isWeekLocked` → banner with “Locked by {name} on {date}”. |
| Disable all edit controls when locked | `canEdit = !isWeekLocked`; save/discard disabled when `!canEdit`; day-level locks disable cells for locked dates. |
| Lock while editor open → on save: error + refresh | Grid save returns 403 when `checkLockForChanges` fails; client shows toast and calls `fetchWeekGovernance()` + `fetchGrid()`. |
| Visibility change refetch | `visibilitychange` listener refetches `fetchWeekGovernance()` so lock state updates when tab regains focus. |
| No override/coverage save without reason | POST `/api/schedule/week/grid/save` requires `reason` (400 if missing). Same for team change. |
| No API bypass | All write paths call `checkLockForChanges` and role checks. |

---

## F6) Export Governance Metadata ✅

| Requirement | Implementation |
|-------------|----------------|
| Week status, Locked by + date, Exported by, Export timestamp | Schedule export API returns `governance` (exportedBy, exportedAt, weeks with status, lockedByName, lockedAt). CSV: governance header + first rows. Planner Export UI: governance block above preview. |

---

## F7) Navigation UX ✅

| Requirement | Implementation |
|-------------|----------------|
| Week: ◀ Previous / ▶ Next next to week date range | Schedule Edit, Schedule Page, Schedule View: arrows + “Week of Sat … – Fri …”, URL `?weekStart=`. |
| Month: ◀ Previous / ▶ Next next to month label | Schedule Edit, Schedule Page: arrows + month label, URL `?month=`. |
| URL reflects navigation; lock/approval preserved | `history.replaceState`; no data mutation; grid/month refetch by state. |

---

## F8) Acceptance Check ✅

| Check | Status |
|-------|--------|
| Locked day/week rejects ALL edits (UI + API) | ✅ `checkLockForChanges` in save/overrides/coverage apply; UI disables save and locked-day cells. |
| Approved week required before week lock | ✅ `lockWeek()` throws if status !== APPROVED. |
| Unlock approved week → ADMIN only | ✅ DELETE week lock API and `canUnlockWeek` = ADMIN only. |
| All actions appear in audit timeline | ✅ All listed actions logged; sidebar and global audit use same API. |
| Past weeks never change retroactively | ✅ Team history by effective date; no batch “recompute past” flows. |
| Exports show governance metadata | ✅ CSV + planner export include governance block/rows. |
| Employee can never edit anything | ✅ Redirect from edit/audit; APIs require edit roles. |

**Forbidden:** No auto-apply of suggestions without user action; no silent edits; no retroactive schedule changes; lock and role checks are server-side (not UI-only).

---

## Key Files

- **Locking / approval:** `lib/services/scheduleLock.ts`, `lib/permissions.ts`
- **Lock/approve APIs:** `app/api/schedule/lock/day/route.ts`, `app/api/schedule/lock/week/route.ts`, `app/api/schedule/approve-week/route.ts`
- **Audit:** `lib/audit.ts`, `app/api/audit/route.ts`, `app/(dashboard)/schedule/audit/ScheduleAuditClient.tsx`
- **Edit + sidebar:** `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx`
- **Grid save (reason + lock check):** `app/api/schedule/week/grid/save/route.ts`
- **Export governance:** `app/api/planner/export/schedule/route.ts`, `app/(dashboard)/planner-export/PlannerExportClient.tsx`
