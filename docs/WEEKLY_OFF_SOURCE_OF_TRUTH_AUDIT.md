# STRICT AUDIT — Weekly Off Policy (Employee Weekly Leaves) Source of Truth

**Project:** Team Monitor (dhtasks.com)  
**Stack:** Next.js App Router + Prisma + PostgreSQL  
**Timezone:** Asia/Riyadh  
**Week starts:** Saturday  
**Audit date:** 2026-03  
**Scope:** Audit + documentation + consistency only. No feature changes.

---

## A) Weekly Off Source of Truth

### Table / model
- **Model:** `Employee` (Prisma)
- **Schema:** `prisma/schema.prisma` — `Employee.weeklyOffDay`

### Columns
| Column        | Type | Comment |
|---------------|------|--------|
| `weeklyOffDay` | `Int` | **0 = Sunday … 6 = Saturday** (JavaScript `Date.getUTCDay()` convention). Stored as integer; NOT NULL. |

### Who can edit (RBAC)
- **Admin employees API:** `PUT /api/admin/employees` and `POST` (create) — `requireRole(['ADMIN','SUPER_ADMIN'])`. Only users with `user.boutiqueId` (session) can create/update employees for that boutique.
- **UI:** `app/(dashboard)/admin/employees/AdminEmployeesClient.tsx` — Admin/SUPER_ADMIN only (same route guard). Dropdown "Off day" maps 0..6 to `days.sun` … `days.sat` via `DAY_KEYS`.

### Default behavior
- **Seed:** `prisma/seed.ts` — all employees get `weeklyOffDay: 5` (Friday).
- **API create:** `app/api/admin/employees/route.ts` — `weeklyOffDay = Number(body.weeklyOffDay ?? 5)`; validation `0 <= weeklyOffDay <= 6`.
- **Deactivate cascade:** `lib/services/deactivateEmployeeCascade.ts` — when (re)creating placeholder employee, sets `weeklyOffDay: 5`.
- **Scripts:** `scripts/create-branch-admins.ts` — `weeklyOffDay: 5`.

---

## B) Weekly Off Computation Rules

- **Week boundary:** Week starts **Saturday** and ends **Friday**. Implementations:
  - Schedule grid: `lib/services/scheduleGrid.ts` — `weekStart` is YYYY-MM-DD of Saturday; week dates built in UTC (`weekStart + 'T00:00:00Z'` + 0..6 days).
  - Week utilities: `lib/utils/week.ts` — `getWeekStartSaturday(date)` uses **local** `date.getDay()` (see inconsistencies).
  - Time: `lib/time.ts` — `getWeekRangeForDate()` uses Riyadh date string then UTC midnight for Saturday–Friday range.
- **How many weekly off days:** **Exactly one** per employee per week. Single integer `weeklyOffDay` (one day of week), not a count.
- **Fixed vs selectable:** **Fixed per employee.** Same day every week (e.g. always Friday). No per-week override in DB; overrides are only via `ShiftOverride` (work shift on a specific date), which can effectively “override” the base off day by assigning a shift.
- **Multiple off days / consecutive:** **Not supported.** Only one day per week; no array or range. Consecutive off would require multiple employees with different `weeklyOffDay` or leave.
- **Friday special rule:** Friday is **PM-only** for scheduling (no AM shift). `weeklyOffDay` can be any 0..6; commonly 5 (Friday). No extra rule that “weekly off cannot be Friday” in code.
- **Full-day vs half-day:** **Full-day only.** `availability` is `WORK | LEAVE | OFF | ABSENT`. On weekly off day the employee gets `OFF` for the whole day; there is no half-day off. AM/PM are not split for weekly off.

**Rule list (bullets):**
- Week = Saturday 00:00 (UTC or Riyadh — see inconsistencies) through Friday 23:59.
- Each employee has exactly one `weeklyOffDay` in 0..6 (Sun–Sat).
- On the day where `date.getUTCDay() === emp.weeklyOffDay`, availability is `OFF` (unless overridden by leave/absent logic).
- Precedence in availability: **LEAVE > OFF (weekly off) > ABSENT > WORK.**
- Weekly off is full-day; no half-day off.
- Weekly off does **not** affect leave balance (leave is separate; scheduled days exclude weekly off for presence/targets).

---

## C) Where It Is Used

### API routes
| Route | Use |
|-------|-----|
| `GET/POST/PUT /api/admin/employees` | Read/create/update `weeklyOffDay`; validation 0–6. |
| `GET /api/schedule/week/grid` | Grid built by `getScheduleGridForWeek` → uses `Employee.weeklyOffDay` to set `availability = 'OFF'` per cell. |
| `GET /api/sales/coverage` | Expected “scheduled” days exclude weekly off: `if (dayOfWeek === emp.weeklyOffDay) continue`. Uses `formatDateRiyadh` for date keys then `getUTCDay()` (see P1). |
| (Roster / dashboard use `availabilityFor` or grid) | Roster and dashboard derive from grid or `availabilityFor`, which both use `weeklyOffDay`. |

### UI pages
| Page | Use |
|------|-----|
| `app/(dashboard)/admin/employees/AdminEmployeesClient.tsx` | Table column “Off day”; create form and edit form dropdown for `weeklyOffDay` (0..6 → day names). |
| `app/(dashboard)/schedule/view/ScheduleViewClient.tsx` | Displays “Off day” label for cells with `availability === 'OFF'` (from grid). |
| `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx` | Same: off-day cells shown as off (from grid). |
| `app/(dashboard)/schedule/SchedulePageClient.tsx` | Same: off day label from grid. |

### Validators / helpers
| File | Role |
|------|------|
| `lib/services/availability.ts` | **Source of truth for availability.** Returns `'OFF'` when `getDayOfWeek(date) === emp.weeklyOffDay`. Uses `date.getUTCDay()`. |
| `lib/services/scheduleGrid.ts` | Builds schedule grid; sets `availability = 'OFF'` when `dayOfWeek === emp.weeklyOffDay` (UTC). Only `WORK` cells count toward AM/PM counts. |
| `lib/services/roster.ts` | Uses `availabilityFor()` → employees with `OFF` go to `offEmployees`; no shift. |
| `lib/services/shift.ts` | `effectiveShiftFor` / `getBaseShiftFor` call `availabilityFor`; if not `WORK` return `'NONE'`. |
| `lib/services/tasks.ts` | `assignTaskOnDate` uses `availabilityFor`; `OFF` → “off” in reason notes and skipped for assignment. |
| `lib/sales-target-presence.ts` | Scheduled days in month exclude weekly off: `if (isOff && !overrideShift) continue`. Uses `date.getUTCDay()`. |
| `app/api/admin/employees/route.ts` | Validates `weeklyOffDay` in 0..6 on create/update. |

**Enforcement:** Weekly off is **hard enforced** in schedule grid, roster, task assignment, sales coverage expected days, and target presence. It is not display-only.

---

## D) Inconsistencies + Fix Suggestions

### P0 (breaks correctness)
- **None identified.** Weekly off is applied wherever schedule/availability is computed; no path found where UI allows setting it but API ignores it, or DB stores it but validation skips it.

### P1 (confusing / wrong in edge cases)
1. **Day-of-week: UTC vs Riyadh**
   - **Where:** `availability.ts` and `scheduleGrid.ts` use `date.getUTCDay()` for weekly off. Dates are often built as `dateStr + 'T00:00:00Z'` (UTC midnight). So the “day” is UTC, not Riyadh. For Asia/Riyadh, a calendar day in Riyadh can be the previous or next UTC day near midnight.
   - **Impact:** For a date string representing “Saturday in Riyadh,” parsing as UTC midnight can yield Friday or Sunday in UTC, so weekly off could align to the wrong calendar day in Riyadh in edge cases.
   - **Recommendation:** Use a single day-of-week helper that interprets the date in **Asia/Riyadh** (e.g. `toRiyadhDateString` then parse to get Riyadh calendar day, then derive day-of-week from that), and use it in `availability.ts`, `scheduleGrid.ts`, `lib/sales-target-presence.ts`, and `app/api/sales/coverage/route.ts`.

2. **Week start: local vs UTC vs Riyadh**
   - **Where:** `lib/utils/week.ts` uses `getDay()` and `getDate()` (local). Schedule grid and API use `weekStart` as YYYY-MM-DD with UTC midnight. So “Saturday” in `getWeekStartSaturday(new Date())` is server-local Saturday; on a server in UTC, Saturday UTC can differ from Saturday Riyadh.
   - **Impact:** Client and server can disagree on which week a date belongs to if client uses Riyadh and server uses UTC/local.
   - **Recommendation:** Define week boundaries in **Riyadh** everywhere (e.g. reuse or extend `lib/time.ts` `getWeekRangeForDate` / Riyadh date string) and have `getWeekStartSaturday` / `getWeekStart` use that same logic so week start is a single source of truth.

3. **Coverage API date keys vs day-of-week**
   - **Where:** `app/api/sales/coverage/route.ts` builds `dateKeysInMonth` with `formatDateRiyadh(cur)` (Riyadh calendar day) but then does `d = new Date(dateKey + 'T00:00:00Z')` and `dayOfWeek = d.getUTCDay()`. So day-of-week is UTC for a string that represents a Riyadh calendar day.
   - **Impact:** Same as (1): wrong day-of-week for Riyadh in edge cases.
   - **Recommendation:** Same as (1): use Riyadh-based day-of-week for “is this a weekly off day?” when determining expected days.

### P2 (nice-to-have)
- **Leave balance:** Confirmed weekly off does **not** affect leave balance (no code found that deducts or adjusts leave for weekly off). Document this in product/backend docs.
- **Single source of truth module:** Introduce one module, e.g. `lib/schedule/weeklyOff.ts`, that exports:
  - `getDayOfWeekRiyadh(date: Date): number` (0–6),
  - `isWeeklyOffDay(empId: string, date: Date): Promise<boolean>` (or sync if Employee is in memory),
  and have `availability.ts`, `scheduleGrid.ts`, `sales-target-presence.ts`, and coverage route use it so weekly-off logic is not duplicated and timezone is consistent.

**Recommended single source of truth:**  
- **Data:** `Employee.weeklyOffDay` (already single field).  
- **Logic:** New or extended module, e.g. `lib/schedule/weeklyOff.ts` (or `lib/time/weeklyOff.ts`), using **Riyadh** for both week boundaries and day-of-week, and used by all availability/grid/coverage/presence code.

---

## Optional Quick Patch (Single Bug)

**If** the only change desired is to align day-of-week with Riyadh in one place:

- **File:** `lib/services/availability.ts`
- **Function:** `getDayOfWeek(date: Date): number`
- **Current:** `return date.getUTCDay();`
- **Change:** Use Riyadh calendar day then derive 0–6. Example (keep existing `toRiyadhDateString` usage elsewhere):

```ts
import { toRiyadhDateString } from '@/lib/time';

export function getDayOfWeek(date: Date): number {
  const str = toRiyadhDateString(date);
  const [y, m, d] = str.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  return utc.getUTCDay();
}
```

So the day-of-week is computed from the Riyadh calendar date (then converted to UTC midnight for that date, so getUTCDay() is consistent with that calendar day). This fixes availability and everything that uses `availabilityFor` (roster, shift, tasks). Schedule grid and sales/coverage/presence would still need the same convention (Riyadh-based day) for full consistency; the above is a minimal single-file patch for the main availability path.

---

**End of audit.**
