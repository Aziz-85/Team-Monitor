# Schedule: Rashid Coverage & Count Fix — Dev Note

## Root cause of wrong counts

- **Before:** Counts were computed from `effectiveShift` only (MORNING → amCount, EVENING → pmCount) but **did not exclude non-WORK cells**. In practice the grid only built cells for WORK days with a shift, so the main bug was different: **coverage shifts (COVER_RASHID_AM/PM) did not exist**, and **baseShift did not apply Friday PM-only** before team parity, so Friday could show AM when it should be PM-only.
- **Additional:** If any code path had counted NONE or included LEAVE/OFF/ABSENT in AM/PM, counts would be wrong. The strict rule is: **only `availability === 'WORK'`** cells contribute; **only `effectiveShift === 'MORNING'`** counts as boutique AM; **only `effectiveShift === 'EVENING'`** counts as boutique PM. Coverage shifts are counted separately (rashidAmCount, rashidPmCount) and never mixed into boutique AM/PM.

## Single source of truth

- **Counts:** `lib/services/scheduleGrid.ts` → `getScheduleGridForWeek()`. It builds `rows` with `cells` (availability, effectiveShift, baseShift), then computes `counts` from the **same** rows/cells in one pass. No separate or stale computation.
  - **Definitions:** For each day index `i`:  
    - `amCount` = number of cells with `availability === 'WORK'` and `effectiveShift === 'MORNING'`  
    - `pmCount` = number of cells with `availability === 'WORK'` and `effectiveShift === 'EVENING'`  
    - `rashidAmCount` = same for `effectiveShift === 'COVER_RASHID_AM'`  
    - `rashidPmCount` = same for `effectiveShift === 'COVER_RASHID_PM'`  
  - NONE, LEAVE, OFF, ABSENT do not count. Coverage does not affect boutique counts.
- **Week start:** `weekStartSaturday()` (used in view and editor) and grid API both normalize the week to **Saturday**; the grid service normalizes `weekStart` to the previous Saturday if another day is passed.
- **Friday rule:** `lib/services/shift.ts` → `computeShiftByLaw()` returns `EVENING` when `dayOfWeek === FRIDAY_DAY_OF_WEEK` (5). `isAmShiftForbiddenOnDate(date, shift)` returns true for Friday + MORNING or COVER_RASHID_AM. Used in overrides POST/PATCH and grid save API to return 400 "Friday is PM-only. AM is not allowed."
- **Availability precedence:** LEAVE > OFF > ABSENT > WORK (in `availability.ts` and in `scheduleGrid.ts` when building cells).
- **effectiveShift:** Always `override.overrideShift` when an active override exists for (empId, date), else `baseShift`. baseShift applies Friday PM-only then team parity.

## What was implemented

- **Data model:** `OverrideShift` enum extended with `COVER_RASHID_AM`, `COVER_RASHID_PM` (migration applied).
- **Editor:** Dropdown options include Cover Rashid (AM) and Cover Rashid (PM); on Friday, MORNING and Cover Rashid (AM) are hidden/disabled. Draft counts only count MORNING/EVENING for boutique AM/PM.
- **View (Excel):** Rashid AM and Rashid PM columns added before AM/PM count columns; filled from effectiveShift COVER_RASHID_AM / COVER_RASHID_PM. Totals: Total AM/PM (boutique); Total Rashid AM/PM shown when > 0.
- **APIs:** POST/PATCH overrides and POST grid/save accept COVER_RASHID_AM/PM and reject MORNING/COVER_RASHID_AM on Friday with 400.
- **Tests:** `__tests__/schedule-counts.test.ts` — coverage exclusion (D1), Friday blocking (D2), count/list integrity (D3). Uses exported `computeDayCountsFromCells()` from scheduleGrid.
- **Friday MinAM:** Grid API returns `minAm: 0` for Friday so coverage/validation never require MinAM on Friday.
- **Excel View:** One "Coverage" count column before AM/PM columns (shows total or "X AM / Y PM"); AM and PM count columns at far right.
- **Toolbar:** Single responsive row: tabs (left), week picker (center), Total AM / Total PM / Total Rashid Coverage (right). Mobile: stacked.

---

## Manual test checklist

- [ ] **Cover Rashid in editor:** As MANAGER/ASSISTANT_MANAGER/ADMIN, open Schedule Editor. For a WORK day (not Friday), dropdown shows Morning, Evening, Cover Rashid (AM), Cover Rashid (PM), NONE. Select Cover Rashid (PM), save; reload and confirm persisted.
- [ ] **Friday no AM:** On a Friday cell, dropdown must NOT show Morning (AM) or Cover Rashid (AM). Only Evening (PM), Cover Rashid (PM), NONE.
- [ ] **View read-only:** As EMPLOYEE, open Schedule View. No edit controls; Excel/Teams/Grid show data only. Total Rashid Coverage badge visible when > 0.
- [ ] **Excel Coverage column:** In Excel View, table has Date, Day, Morning block, Evening block, Rashid AM names, Rashid PM names, **Coverage** (count), **AM**, **PM** (far right). Coverage cell shows number or "1 AM / 1 PM".
- [ ] **Counts:** Set one employee to COVER_RASHID_PM on a day. Boutique PM count for that day does not increase; Coverage/Rashid reflect it. Set same employee to LEAVE that day; all counts for that day exclude them.
- [ ] **Friday validation:** Week including Friday: Friday row must not show "AM < Min AM" warning.
- [ ] **Toolbar:** Desktop: one row with tabs left, week picker center, three badges right. Mobile: elements stack.
