# Historical sales import (canonical SalesEntry)

This document distinguishes **three** flows that are easy to confuse:

| Flow | Route / API | Writes |
|------|-------------|--------|
| **Historical JSON snapshot** | `POST /api/admin/historical-import` | `data/historical-snapshots/{boutique}/{YYYY-MM}.json` only — **not** SalesEntry |
| **Operational yearly ledger import** | `POST /api/sales/import/yearly` | Daily Sales Ledger lines + `syncDailyLedgerToSalesEntry` → SalesEntry as **LEDGER** |
| **Historical SalesEntry initial** | `POST /api/admin/import-center/historical-sales/initial` | **SalesEntry only**, source `HISTORICAL_IMPORT`, insert-if-empty |
| **Historical SalesEntry correction** | `POST /api/admin/import-center/historical-sales/correction` | **SalesEntry only**, source `HISTORICAL_CORRECTION`, update existing non-MANUAL rows |

## Initial import policy

- Branch-scoped file (same `Import_YYYY` + `emp_*` columns as yearly template).
- **Insert only** when no `SalesEntry` exists for `(boutiqueId, dateKey, userId)`.
- If a row already exists → **rejected** (`EXISTS_IN_DB`); no silent overwrite.
- Dates must fall in **past closed months** (strictly before the current calendar month in **Asia/Riyadh**) and not in the future.
- Uses `upsertCanonicalSalesEntry` with `allowLockedOverride: true` for historical closed days (still no overwrite of existing SalesEntry).
- Does **not** mutate `BoutiqueSalesSummary` / lines; ledger UI may not match until a separate reconciliation.

## Correction import policy

- **ADMIN / SUPER_ADMIN** only; **mandatory reason** (min 8 characters); audit log entry on successful updates.
- **Updates only** rows that already exist; **MANUAL** sources are **never** changed.
- Uses `forceAdminOverride: true` so correction can replace **LEDGER** / lower-precedence rows after the explicit MANUAL check (precedence is still documented in `lib/sales/salesEntryWritePrecedence.ts`).
- Missing SalesEntry → `MISSING_TARGET` (use initial import first).

## Precedence

- `HISTORICAL_CORRECTION` rank **81** (between LEDGER 90 and bulk imports 80).
- `HISTORICAL_IMPORT` rank **80** (aligned with `YEARLY_IMPORT` / `EXCEL_IMPORT`).
- Single source of truth for ordering: `lib/sales/salesEntryWritePrecedence.ts`.

## Templates

- `GET /api/admin/import-center/templates/historical-sales-initial`
- `GET /api/admin/import-center/templates/historical-sales-correction`

Same Excel shape as yearly (`parseYearlyImportExcel`); README sheet describes mode and upload URL.

## Employee transfers

Validation is **boutique + date + identity** (emp column in **this** branch’s file). The same person may appear in another boutique’s file for other date ranges.

## UI

Import Center (`/admin/import` / `/admin/import-center`) includes **Historical sales (canonical SalesEntry)** cards with dry-run and CSV conflict download.

## Ledger reconciliation (Policy A)

See **`docs/historical-ledger-reconciliation.md`**. Historical DB imports **do not** backfill the daily ledger; **SalesEntry** is authoritative for canonical reads and parity checks; ledger-oriented KPIs may differ.
