# Monthly Matrix Import — Real Endpoint and Trace

## Step 1: Client call (exact URL)

- **UI**: Admin → **Monthly Matrix** at `/admin/import/monthly-matrix`
- **Client component**: `app/(dashboard)/admin/import/MatrixImportClient.tsx`
- **Exact URL on upload/apply**: **POST `/api/import/monthly-matrix`**
- **Body**: `FormData` with `file`, `month` (YYYY-MM), `includePreviousMonth` (true/false), `dryRun` (true/false)

The **sales** page “Monthly Import (Matrix) → SalesEntry” at `/sales/import-matrix` uses **POST `/api/sales/import/matrix`** (writes directly to `SalesEntry`). That is a **different** flow. The Admin “Monthly Matrix” upload uses **POST `/api/import/monthly-matrix`** only.

---

## Step 2: Server write (real importer)

- **Route**: `app/api/import/monthly-matrix/route.ts`
- **Writes**: `BoutiqueSalesSummary` + `BoutiqueSalesLine` (source `EXCEL_IMPORT`), then for each date calls `syncDailyLedgerToSalesEntry()` which syncs to **`SalesEntry`** via `syncSummaryToSalesEntry()`.

So the “real” importer for the Admin Monthly Matrix upload is **`app/api/import/monthly-matrix/route.ts`**. It does not write to `SalesEntry` directly; the sync does, using the source passed from the route.

---

## Step 3: Trace marker

- In **`app/api/import/monthly-matrix/route.ts`**, every call to `syncDailyLedgerToSalesEntry()` now passes **`sourceOverride: 'MONTHLY_MATRIX_TRACE_V9'`**.
- **`lib/sales/syncDailyLedgerToSalesEntry.ts`** accepts optional `sourceOverride` and passes it as the SalesEntry `source` when syncing.
- **`lib/sales/syncLedgerToSalesEntry.ts`** `syncSummaryToSalesEntry(summaryId, createdById, sourceForEntry)` uses that value for create/update/delete of `SalesEntry` rows for that date.

So any SalesEntry row created or updated by the Admin Monthly Matrix import will have **`source = 'MONTHLY_MATRIX_TRACE_V9'`**.

---

## Step 4: Proof (SQL)

After one import from the UI (Admin → Monthly Matrix → choose file, month, Apply):

```sql
SELECT source, COUNT(*), MAX("updatedAt") FROM "SalesEntry" GROUP BY source;
```

You should see a row with **`source = 'MONTHLY_MATRIX_TRACE_V9'`** and the corresponding count and max `updatedAt`.

---

## Step 5: Fix applied to this importer

The **same** route `app/api/import/monthly-matrix/route.ts` already has:

- **Scan by dateKey**: Builds `rowsByDateKey` from **all** sheet rows; date from column B only (`parseExcelDateToYMD` → `ymdToUTCNoon` → `dateKeyUTC`). No `dataStartRow` / header offset.
- **Hard fail if month-01 missing**: Returns 400 `IMPORT_ROW_START_MISMATCH` when `!rowsByDateKey.has(month + '-01')`.
- **No index-based dates**: Dates come only from cell B; import order follows `monthDaysUTC(month)`.
- **Numeric parsing**: `parseNumberCell()` (unwrap `.v`/`.value`/`.w`/`.result`, numbers and comma-separated strings).
- **Employee columns**: Header detection with fallback D..L; TOTAL column never read.

No Prisma schema or UI changes. Trace can be removed later by dropping `sourceOverride` from the import route and using the default `LEDGER` again.
