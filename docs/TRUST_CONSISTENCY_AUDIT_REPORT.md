# Trust & Consistency Audit Report

**Date:** 2025-02-25  
**Scope:** Full-site audit for trust-breaking mismatches, date confusion, and consistency issues  
**Constraint:** Analysis only — no code changes

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 4 | Trust-breaking: users see wrong data or misleading labels |
| **P1** | 6 | Important clarity: confusion about date context or scope |
| **P2** | 5 | Polish: labels, translations, empty columns |

---

## P0 — Trust-Breaking

### P0-1: Home — Performance KPIs ignore date picker

| Field | Value |
|-------|-------|
| **Page** | Home (`/`) |
| **Symptom** | User selects a past date; KPIs (Today, This Week, This Month), Pace card, chart, and Top Sellers still show **today's** data. Roster, Shift Snapshot, Coverage, Key Holder, and Tasks use the selected date. |
| **Root cause** | `/api/performance/summary` has no `date` param; uses `getRiyadhNow()` server-side. Home fetches it once in `useEffect` with empty deps. |
| **Files** | `app/(dashboard)/HomePageClient.tsx`, `app/api/performance/summary/route.ts` |
| **Recommended fix** | Either: (a) Add `date` param to performance API and pass selected date, or (b) Add clear subtitle: "Performance: always today" and disable date picker for performance section. |
| **Type** | Logic |

---

### P0-2: Key Holder card says "Today" but shows selected date

| Field | Value |
|-------|-------|
| **Page** | Home (`/`) |
| **Symptom** | Card title "Key Holder Today" is hardcoded. Data comes from `/api/home?date=` (selected date). When user picks a past date, label says "Today" but shows key holder for that past date. |
| **Root cause** | `KeyHolderCard` title is static; `todayTasks` from home API is date-aware. |
| **Files** | `components/dashboard/home/KeyHolderCard.tsx`, `app/(dashboard)/HomePageClient.tsx` |
| **Recommended fix** | Make title dynamic: "Key Holder" when date ≠ today, "Key Holder Today" when date = today. Or always "Key Holder" with date in subtitle. |
| **Type** | UI clarity |

---

### P0-3: Sales Summary — Chart shows month of `to` only, not full from–to

| Field | Value |
|-------|-------|
| **Page** | Sales Summary (`/sales/summary`) |
| **Symptom** | User selects from=2025-01-01, to=2025-03-31 (quarter). Chart "Target vs Actual (MTD)" shows only **March** MTD. Table and Sales strip show full Jan–Mar. KPI cards (Week, Month, Quarter, Half, Year) are anchored to `to` and may not match the selected range. |
| **Root cause** | `dailyTrajectory` in targets API is built for month of `to` only (MTD cumulative). Week KPI uses week containing `to`. |
| **Files** | `app/api/sales/summary/targets/route.ts`, `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` |
| **Recommended fix** | Add subtitle: "Chart: MTD for month of end date ({monthKey})" when from–to spans multiple months. Or extend chart to support full range (requires API change). |
| **Type** | Logic + UI clarity |

---

### P0-4: Sales Summary — Progress % column always "—"

| Field | Value |
|-------|-------|
| **Page** | Sales Summary (`/sales/summary`) |
| **Symptom** | Employee Contribution table has "Progress %" column; every row shows "—". Column implies employee target progress but is not wired. |
| **Root cause** | No employee target data passed to table; column is placeholder. |
| **Files** | `app/(dashboard)/sales/summary/SalesSummaryClient.tsx` (line 464) |
| **Recommended fix** | Either wire employee target progress (employeeNet / employeeTarget) or remove/hide the column until data is available. |
| **Type** | Logic |

---

## P1 — Important Clarity

### P1-1: Home — Two task blocks with different date contexts

| Field | Value |
|-------|-------|
| **Page** | Home (`/`) |
| **Symptom** | "Key Holder" + "Tasks Today" (with assignees) use selected date. "Tasks Today" (my tasks) uses **always today** via `/api/tasks/my-today`. When date ≠ today, user sees tasks for selected date in one card and today's tasks in another, both under "today" wording. |
| **Root cause** | Key Holder / todayTasks from `/api/home?date=`; my tasks from `/api/tasks/my-today` (no date param). |
| **Files** | `app/(dashboard)/HomePageClient.tsx`, `app/api/tasks/my-today/route.ts` |
| **Recommended fix** | Add subtitle to Tasks Today card: "Your tasks for today" (always today). Add subtitle to Key Holder / task list: "For {date}" when date ≠ today. |
| **Type** | UI clarity |

---

### P1-2: CoverageStatusCard — Count vs message mismatch

| Field | Value |
|-------|-------|
| **Page** | Home (`/`) |
| **Symptom** | Card shows "X warnings this week" (count from `weekSummary`). Summary text is `coverageValidation[0].message` (selected date). Suggested action applies to selected date. Count is week-wide; message and action are day-specific. |
| **Root cause** | `warningCount` = days with issues in week; `summary` = first validation message for selected date. |
| **Files** | `app/(dashboard)/HomePageClient.tsx`, `components/dashboard/home/CoverageStatusCard.tsx` |
| **Recommended fix** | When selected date has validation, show that day's message. Add: "X day(s) need attention this week" as secondary line. Or split: "Selected day: {message}" and "Week: X days with issues." |
| **Type** | UI clarity |

---

### P1-3: Employee Home — Targets/sales always today, schedule date-aware

| Field | Value |
|-------|-------|
| **Page** | Employee Home (`/employee`) |
| **Symptom** | Date picker affects schedule and tasks. Target/sales card comes from `/api/me/targets` (no date param) — always today. User picks past date: schedule shows that date, targets show today. |
| **Root cause** | `/api/me/targets` has no date param; uses server "today". |
| **Files** | `app/(dashboard)/employee/EmployeeHomeClient.tsx`, `app/api/me/targets/route.ts` |
| **Recommended fix** | Add subtitle to target card: "Today's progress" or add date param to targets API when historical view is needed. |
| **Type** | Logic + UI clarity |

---

### P1-4: Sales Summary — Week KPI may not match from–to range

| Field | Value |
|-------|-------|
| **Page** | Sales Summary (`/sales/summary`) |
| **Symptom** | Week KPI uses week containing `to`. If from=2025-02-01, to=2025-02-28, Week shows week of Feb 28 (e.g. Feb 22–28), not necessarily aligned with user's mental model of "this week" in the range. |
| **Root cause** | Targets API derives all periods (week, month, quarter, half, year) from `to` date. |
| **Files** | `app/api/sales/summary/targets/route.ts` |
| **Recommended fix** | Add sub-label to Week card: "Week of {to}" or "Week containing end date" when from–to spans multiple weeks. |
| **Type** | UI clarity |

---

### P1-5: Home — No indication that performance section is "today only"

| Field | Value |
|-------|-------|
| **Page** | Home (`/`) |
| **Symptom** | Single date picker at top. No visual separation between date-aware blocks (roster, coverage, tasks) and always-today blocks (performance KPIs, chart, top sellers). |
| **Root cause** | Layout treats all sections equally; no section-level date context. |
| **Files** | `app/(dashboard)/HomePageClient.tsx` |
| **Recommended fix** | Add section subtitle: "Performance (always today)" or group date-aware vs today-only sections with clear headings. |
| **Type** | UI clarity |

---

### P1-6: Schedule week — getWeekStartSaturday uses local time

| Field | Value |
|-------|-------|
| **Page** | Schedule, Home week summary |
| **Symptom** | `getWeekStartSaturday` in `lib/utils/week.ts` uses `date.getDay()` (local). Schedule grid and APIs use UTC. On UTC server, Saturday local can differ from Saturday Riyadh near midnight. |
| **Root cause** | Documented in `docs/WEEKLY_OFF_SOURCE_OF_TRUTH_AUDIT.md`. |
| **Files** | `lib/utils/week.ts`, `lib/services/scheduleLock.ts`, `lib/services/scheduleGrid.ts` |
| **Recommended fix** | Use Riyadh week boundaries consistently (e.g. `getDowRiyadhFromYmd`, `toRiyadhDateString`). |
| **Type** | Logic |

---

## P2 — Polish

### P2-1: Hardcoded labels not in i18n

| Field | Value |
|-------|-------|
| **Page** | Home, CoverageStatusCard, ShiftSnapshotCard, KeyHolderCard |
| **Symptom** | "Coverage Status", "warnings this week", "Shift Snapshot", "Key Holder Today", "Target vs Actual (MTD)", "Cumulative sales vs target by day", "Top Sellers", "Operational Alerts", "All clear" are hardcoded. |
| **Root cause** | Components use literal strings instead of `t()` keys. |
| **Files** | `components/dashboard/home/*.tsx`, `app/(dashboard)/HomePageClient.tsx` |
| **Recommended fix** | Add keys to `messages/en.json` and `messages/ar.json`; use `t()` in components. |
| **Type** | UI clarity |

---

### P2-2: Sales Summary — Chart and table from different APIs

| Field | Value |
|-------|-------|
| **Page** | Sales Summary (`/sales/summary`) |
| **Symptom** | Chart from `/api/sales/summary/targets`; table from `/api/sales/summary`. Both use same from/to; targets adds BoutiqueMonthlyTarget. Net sales in strip/table should match chart cumulative at end of month. Minor risk of drift if APIs diverge. |
| **Root cause** | Separate APIs by design. |
| **Files** | `app/api/sales/summary/route.ts`, `app/api/sales/summary/targets/route.ts` |
| **Recommended fix** | Document that both use SalesEntry; add regression test that table net total matches chart's last point when to = last day of month. |
| **Type** | Logic (low risk) |

---

### P2-3: Dashboard — No date picker

| Field | Value |
|-------|-------|
| **Page** | Dashboard (`/dashboard`) |
| **Symptom** | Dashboard uses `getRiyadhNow()`; no date selector. User cannot view historical dashboard. |
| **Root cause** | By design for "current state" view. |
| **Files** | `app/api/dashboard/route.ts` |
| **Recommended fix** | If historical view is needed, add date param. Otherwise add subtitle "As of today" for clarity. |
| **Type** | UI clarity |

---

### P2-4: OperationalAlertsCard — "All clear" hardcoded

| Field | Value |
|-------|-------|
| **Page** | Home |
| **Symptom** | "All clear" and "Operational Alerts" are hardcoded. |
| **Files** | `components/dashboard/home/OperationalAlertsCard.tsx` |
| **Recommended fix** | Add to i18n. |
| **Type** | UI clarity |

---

### P2-5: Role/scope display inconsistency

| Field | Value |
|-------|-------|
| **Page** | Various |
| **Symptom** | Some pages show operational boutique/scope (e.g. Schedule, Sales Summary); Home and Employee Home do not. User may not know which boutique context applies. |
| **Root cause** | Inconsistent UX for scope display. |
| **Files** | Multiple dashboard pages |
| **Recommended fix** | Add scope/boutique indicator to Home and Employee Home when multi-boutique. |
| **Type** | UI clarity |

---

## Appendix: Data Source Map

| Page | Date-aware data | Always-today data |
|------|-----------------|-------------------|
| Home | roster, coverage, Key Holder, todayTasks (with assignees), weekSummary | performance (KPIs, chart, top sellers), myTodayTasks |
| Employee Home | schedule, tasks | targets/sales |
| Sales Summary | All (from/to) | — |
| Dashboard | — | All |
| Schedule | weekStart | — |

---

## Appendix: API Date Params

| API | Date param | Default |
|-----|------------|---------|
| `/api/home` | `date` | today |
| `/api/performance/summary` | none | server now |
| `/api/tasks/my-today` | none | KSA today |
| `/api/employee/home` | `date` | today |
| `/api/me/targets` | none | server now |
| `/api/schedule/week` | `weekStart` | required |
| `/api/sales/summary` | `from`, `to` | last 31 days |
| `/api/sales/summary/targets` | `from`, `to` | required |
| `/api/dashboard` | none | server now |
