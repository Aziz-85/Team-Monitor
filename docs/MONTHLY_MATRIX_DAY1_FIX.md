# Monthly Sales Matrix Import — Day 1 Fix (STRICT PATCH)

**Issue:** Monthly Sales Matrix import always missed the first day of the month (day=1); e.g. 2026-02-01 was not inserted or was omitted from API/UI.

---

## 1) Exact reason day 1 was missing

- **Source of truth for parsing:** The Excel Monthly Matrix is parsed in two places:
  - **Primary:** `app/api/import/monthly-matrix/route.ts` (POST) — in-place AOA parsing with `toDateKey(dateRaw)` and `allowedDateSet`.
  - **Preview/Apply (dashboard):** `lib/sales/matrixImportParse.ts` — already used `toRiyadhDayKey` and `getMonthRangeDayKeys` for allowed dates.

- **Root cause in `app/api/import/monthly-matrix/route.ts`:**
  1. **`toDateKey()`** used `(raw as Date).toISOString().slice(0, 10)` and `excelSerialToDate(raw)` then `.toISOString().slice(0, 10)` — i.e. **UTC** date. When Excel stores “Feb 1” as local midnight (e.g. Riyadh), the value can be `2026-01-31T21:00:00.000Z`, so the parsed dateKey became **2026-01-31**. That row was then filtered by `allowedDateSet`, which was built for February (2026-02-01 .. 2026-02-28), so the row was **excluded** and day 1 never appeared in the queue.
  2. **`allowedDateSet`** was built with a UTC-based loop (`d.toISOString().slice(0, 10)`), which is consistent for UTC but not for Riyadh; the single source of truth for “days in month” is `getMonthRangeDayKeys(month)` (Riyadh).

So day 1 was missing because: (a) the first data row’s date was parsed as the **previous UTC day** (e.g. 2026-01-31), and (b) the allowed set was not aligned with Riyadh month boundaries. Fix: use **Riyadh** for both parsing and allowed dates.

---

## 2) Exact files changed

| File | Change |
|------|--------|
| `app/api/import/monthly-matrix/route.ts` | Import `toRiyadhDayKey`, `getMonthRangeDayKeys`. `toDateKey()` now uses `toRiyadhDayKey()` for string/Date/number. `allowedDateSet` built from `getMonthRangeDayKeys(month).keys` (and previous month keys if `includePreviousMonth`). |
| `app/api/sales/import/template/route.ts` | Import `getMonthRangeDayKeys`. Template data rows built from `getMonthRangeDayKeys(monthParam).keys` so first data row is always day 1 (same source of truth). |
| `lib/sales/parseMatrixTemplateExcel.ts` | Import `toRiyadhDayKey`. Added `rawToDateKey()` (string YYYY-MM-DD, Date, Excel serial → Riyadh dateKey). Date column parsing uses `rawToDateKey(dateRaw)` so Excel Date/serial for day 1 no longer dropped. |
| `__tests__/sales-matrix-date-rounding.test.ts` | New describe “Monthly matrix import includes day 1 (regression)”: Feb first key is 2026-02-01; Excel Feb 1 midnight Riyadh parses to 2026-02-01; allowed set includes 2026-02-01. Comment block with proof SQL. |

---

## 3) API/UI verification (no day 1 dropped)

- **GET `/api/sales/monthly-matrix`** already uses `buildDays()` → `getMonthRangeDayKeys(monthKey).keys`; the days array is `[1..daysInMonth]` (Riyadh). No `.slice(1)` or start-at-2; no change.
- **Template:** Rows are now built from `getMonthRangeDayKeys(monthParam).keys`; first data row = day 1.
- **Export:** `app/api/sales/import/export/route.ts` iterates `rangeStart`..`rangeEnd` in UTC; for a single month, day 1 is included. No change.

---

## 4) Proof by query (after import)

After importing a Feb 2026 matrix where day 1 has at least one value:

```sql
SELECT "dateKey", COUNT(*) AS cnt, SUM(amount) AS total
FROM "SalesEntry"
WHERE "boutiqueId" = :boutiqueId AND "dateKey" = '2026-02-01'
GROUP BY "dateKey";
```

- **Expected:** `cnt` ≥ 1 (at least one row per employee with data for 2026-02-01), `total` = sum of amounts for 2026-02-01 for that boutique.

---

## 5) Regression test

Run:

```bash
npx jest __tests__/sales-matrix-date-rounding.test.ts
```

The describe **“Monthly matrix import includes day 1 (regression)”** asserts:

- `getMonthRangeDayKeys('2026-02').keys[0] === '2026-02-01'`
- `toRiyadhDayKey(2026-01-31T21:00:00.000Z) === '2026-02-01'`
- `allowedDateSet` built from `getMonthRangeDayKeys('2026-02')` contains `'2026-02-01'`

No DB or UI changes; schema unchanged.
