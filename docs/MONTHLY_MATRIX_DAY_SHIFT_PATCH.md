# Monthly Sales Matrix Day-Shift Patch — Validation Checklist

## Changed files and replacements

| File | Replacements |
|------|---------------|
| **lib/dates/safeCalendar.ts** (NEW) | Added `dateKeyUTC`, `monthKeyUTC`, `monthRangeUTCNoon`, `monthDaysUTC`, `parseExcelDateToYMD`, `ymdToUTCNoon`. Calendar day helpers; no `toISOString().slice()`. |
| **app/api/sales/monthly-matrix/route.ts** | `buildDays`: `getMonthRangeDayKeys` → `monthDaysUTC`. Range response uses `monthRangeUTCNoon`. Dev log: months, range (dateKeyUTC), days[0..2]. |
| **app/api/sales/import/export/route.ts** | `s.date.toISOString().slice(0,10)` → `dateKeyUTC(s.date)`. Day list: loop with `d <= rangeEnd` replaced by `monthDaysUTC(month)` (and prev) for `dayKeys`; export rows iterate `dayKeys`. Query: `lte: rangeEnd` → `lt: rangeEnd` (endExclusive). |
| **app/api/import/monthly-matrix/route.ts** | `s.date.toISOString().slice(0,10)` → `dateKeyUTC(s.date)` in dry-run `summaryByDate`. Dev log: existing dateKeyUTC min/max. |
| **app/api/sales/import/preview/route.ts** | `s.date.toISOString().slice(0,10)` → `dateKeyUTC(s.date)` in `summaryByDate`. |
| **app/api/sales/compare/route.ts** | Matrix mode: `allowedDateSet` from loop `d.toISOString().slice(0,10)` → `monthDaysUTC(prev)` + `monthDaysUTC(month)`. MSR mode: same with `allowedDateSetMsr`. |
| **lib/sales/matrixImportParse.ts** | Date from dateKey: `T00:00:00.000Z` → `T12:00:00.000Z`. |
| **lib/sales/parseMatrixTemplateExcel.ts** | Date from dateKey: `T00:00:00.000Z` → `T12:00:00.000Z`. |

## Quick validation steps

1. **Re-import 2026-02**  
   Use the Monthly Matrix import with a 2026-02 file that has data for day 1.

2. **SQL — group by date**  
   ```sql
   SELECT date, SUM(amount)::int total
   FROM "SalesEntry"
   WHERE "boutiqueId" = 'bout_dhhrn_001' AND month = '2026-02' AND source = 'IMPORT'
   GROUP BY date ORDER BY date;
   ```  
   - **Confirm:** A row for 2026-02-01 exists.  
   - **Confirm:** No row for 2026-03-01 (no extra day at end).

3. **Monthly Sales Matrix UI**  
   - Open Monthly Sales Matrix, select 2026-02.  
   - **Confirm:** First column is day 1 (no shift at start).  
   - **Confirm:** Last column is day 28 (no extra day at end).  
   - **Confirm:** Totals match Excel / DB.

4. **Export**  
   Export 2026-02 from the same flow; re-import and confirm day 1 and day 28 are present and match.

## Summary

- **Root cause:** Using `toISOString().slice(0,10)` for day keys introduced UTC vs calendar-day shift and an extra day at end.  
- **Fix:** Single source of truth in `lib/dates/safeCalendar.ts`: `dateKeyUTC` for Date→key, `monthDaysUTC` for month day list (endExclusive loop, no inclusive end). Import/export/compare/preview and matrix API use these; matrix importer builds dates at UTC noon from dateKey to avoid boundary drift.
