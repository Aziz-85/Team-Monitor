# Phase E — Automation & Smart Productivity

## Summary

Phase E adds **safe, explainable automation** that helps managers fix schedule issues faster. **No auto-apply**: all actions are explicit, logged, and reversible. Employee role sees none of this (view-only).

---

## E1) Smart Suggestions

- **Engine:** `lib/services/scheduleSuggestions.ts` — `buildScheduleSuggestions(grid)` returns ranked suggestions from the week grid.
- **Triggers (per day):** AM > PM → MOVE (one AM → PM); AM < MinAM with Rashid AM → REMOVE_COVER (cancel Rashid AM → Boutique AM); PM shortage (PM < AM or PM < MinPM) with Rashid PM → REMOVE_COVER (cancel Rashid PM → Boutique PM). Friday rule: never suggests MORNING or COVER_RASHID_AM on Friday.
- **Output:** Type (MOVE | REMOVE_COVER), affected employees, before/after counts, reason, highlightCells for preview.
- **API:** Grid API returns `suggestions` when `?suggestions=1` and user has `canEditSchedule` (Manager/Assistant Manager/Admin only).
- **UI:** Schedule Editor sidebar has a "Suggestions" panel. Each suggestion has **Preview** (scroll to day + highlight cell), **Apply** (opens confirm modal, then POST grid/save with one change + audit reason), **Dismiss** (hide from list).

---

## E2) One-Click Fix Actions

- **Buttons** in Suggestions panel (when applicable): "Move 1 from AM → PM", "Remove Rashid coverage". Click opens the same confirm modal as Apply (shows employee(s) and rule).
- **On confirm:** Apply override via existing `POST /api/schedule/week/grid/save`; reason includes suggestion text; audit logged.
- **On cancel:** No changes.

---

## E3) Planner Export (Schedule Shifts)

- **API:** `POST /api/planner/export/schedule` — body: `{ from, to, boutiqueOnly?, rashidOnly?, format?: 'json' | 'csv' }`. Returns schedule-based rows for Planner.
- **Task naming:** `[Boutique] Morning Shift – YYYY-MM-DD`, `[Boutique] Evening Shift – …`, `[Rashid] Morning Coverage – …`, `[Rashid] Evening Coverage – …`.
- **Filters:** Boutique only, Rashid only (both false = both included).
- **UI:** Planner Export page has a second card "Schedule shifts export" with date range, checkboxes, **Preview** (table, first 50 rows), **Download** CSV.

---

## E4) Weekly & Monthly Insights

- **API:**  
  - `GET /api/schedule/insights/week?weekStart=` — avg AM/PM, days with violations, Rashid coverage total, most adjusted employee (by override count in week).  
  - `GET /api/schedule/insights/month?month=` — AM vs PM trend (per day), total Rashid coverage days (overrides), top warning types.
- **UI:** Schedule View (when full grid) shows **Insights** cards: Avg AM, Avg PM, Days with violations, Rashid total, Most adjusted (name + override count). Weekly insights only in this phase; month API is available for future use.

---

## E5) Reminders & Nudges

- **API:** `GET /api/schedule/reminders` — Manager/Admin only. Returns active reminders: "Tomorrow AM < MinAM", "Friday PM overload", "Unresolved schedule warning" (next 3 days). Each has `type`, `message`, `copyText` (WhatsApp-ready).
- **UI:** Schedule View toolbar shows "Reminders (n)" when there are reminders; click opens dropdown with messages and **Copy all (WhatsApp)**. No auto-email.

---

## E6) Performance & Safety

- Suggestions are computed **server-side** with the grid (one request when loading week with `suggestions=1`). No client-side recompute loop; no debounce needed for suggestion fetch.
- **Apply** always goes through existing override save API; audit reason is stored.
- **No background jobs**; no auto-apply; all actions explicit and reversible.

---

## Manual Test Checklist

1. Create AM > PM imbalance → suggestions appear in Editor sidebar; "Move 1 from AM → PM" suggested.
2. Apply "Move 1 from AM → PM" (or Apply on a MOVE suggestion) → counts fix, audit logged; suggestion can be dismissed after apply.
3. Export Planner schedule for a date range → choose filters, Preview shows table; Download CSV matches.
4. Friday edge case → no MORNING or COVER_RASHID_AM suggestion for Friday.
5. Employee role → Schedule Editor and suggestions/reminders/insights/export schedule are not available (view-only; APIs return 403 for write and suggestions only for edit roles).

---

## Files Touched / Added

- **New:** `lib/services/scheduleSuggestions.ts`, `app/api/planner/export/schedule/route.ts`, `app/api/schedule/insights/week/route.ts`, `app/api/schedule/insights/month/route.ts`, `app/api/schedule/reminders/route.ts`
- **Updated:** `lib/services/planner.ts` (schedulePlannerRows), `app/api/schedule/week/grid/route.ts` (suggestions in response), `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx` (suggestions panel, one-click, confirm, apply), `app/(dashboard)/schedule/view/ScheduleViewClient.tsx` (insights, reminders), `app/(dashboard)/planner-export/PlannerExportClient.tsx` (schedule export card), `messages/en.json`, `messages/ar.json`
