# Calendar policy: Official Holidays + Event Periods

## Precedence (availability)

1. **LEAVE** — Approved leave always => LEAVE.
2. **OfficialHoliday.isClosed = true** — => HOLIDAY (non-working). **isClosed = false** — holiday exists but boutique is open; do not block, continue with normal rules.
3. **EmployeeDayOverride** (existing) — FORCE_OFF => OFF; FORCE_WORK => workable (skip weekly off and closed holiday for that employee).
4. **EventPeriod** — If date falls in a period with `suspendWeeklyOff` or `forceWork`: weekly off is ignored (default WORK unless other reasons).
5. **Weekly off** — Applies only when not suspended and no closed holiday. Uses **Riyadh** day-of-week (`getDowRiyadhFromYmd(ymd)`).
6. **ABSENT** — Inventory absent (unchanged).
7. **WORK** — Default.

All date keys are canonical `YYYY-MM-DD` (Riyadh calendar day). Use `lib/time/weekly.ts` and `lib/services/calendarPolicy.ts` for consistency.

## Manual test steps

1. **Weekly off**  
   Set an employee’s `weeklyOffDay` to Friday (5). In a normal week, that Friday should show OFF in the schedule grid and be excluded from expected days in coverage.

2. **Event period (suspend weekly off)**  
   Admin → Calendar → Event Periods: add a period with “Suspend weekly off” and a date range that includes that Friday. Reload schedule: the same Friday should show as WORK (or base shift), not OFF.

3. **Closed holiday**  
   Admin → Calendar → Official Holidays: add a date with “Boutique closed” checked. That date should show HOLIDAY in the grid and be excluded from expected days.

4. **Open holiday**  
   Add a holiday with “Boutique closed” unchecked. That date should **not** be HOLIDAY; weekly off and other rules apply as usual.

5. **Presence / coverage**  
   In sales coverage (or presence), expected days should: exclude closed holiday dates; exclude weekly off days only when not in an event period with suspend/force work; during an event period, include what would have been weekly off as expected.
