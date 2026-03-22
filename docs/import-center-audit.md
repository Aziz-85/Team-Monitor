# Import Center — audit (Phase 1)

Grounded in repo layout as of import-center unification. **Do not delete legacy routes without review.**

## UI pages (admin / targets)

| Route | Role / notes | Purpose |
|-------|----------------|---------|
| `/admin/import` | ADMIN, SUPER_ADMIN | **Unified Import Center** (`ImportCenterClient`): templates + links to upload UIs. |
| `/admin/import-center` | Same | Alias of Import Center. |
| `/admin/import/sales` | + managers (nav) | Tabs: simple/yearly import, matrix, issues, ledger (`SalesImportTabsClient`). |
| `/admin/import/monthly-matrix` | ADMIN | Matrix xlsx upload UI. |
| `/admin/import/monthly-snapshot` | ADMIN | Monthly snapshot (targets/staff). |
| `/admin/import/issues` | → redirect `/admin/import/sales?section=issues` | |
| `/admin/historical-import` | ADMIN | Historical snapshot import UI; banner → Import Center. |
| `/targets/import` | varies | Boutique + employee target import (preview/apply). |
| `/sales/import`, `/sales/import-matrix`, etc. | Legacy aliases | Redirect to `/admin/import/sales?...` |

## APIs (representative)

| Area | Path pattern | Writes DB? |
|------|----------------|------------|
| Import center templates | `GET /api/admin/import-center/templates/*` | No (xlsx only) |
| Sales matrix | `/api/sales/import/matrix`, template `/api/sales/import/template` | Yes (canonical path) |
| Admin sales import | `/api/admin/sales-import` | Yes |
| Yearly / MSR | Under admin sales import + parsers in `lib/sales/` | Yes |
| Historical **snapshot** (JSON) | `POST /api/admin/historical-import` | **Snapshot files only** — not SalesEntry |
| Historical **SalesEntry** initial | `POST /api/admin/import-center/historical-sales/initial` | Yes — `HISTORICAL_IMPORT`, insert-if-empty |
| Historical **SalesEntry** correction | `POST /api/admin/import-center/historical-sales/correction` | Yes — `HISTORICAL_CORRECTION`, update non-MANUAL |
| Yearly **ledger** import | `POST /api/sales/import/yearly` | Yes — ledger lines + sync → SalesEntry **LEDGER** |
| Targets | `/api/targets/import/*` (preview/apply) | Yes |
| Admin import (legacy) | `/api/admin/import` | Mixed (inspect handler) |

## Template generators (`lib/import-center/`)

- `buildYearlySalesTemplate`, `buildHistoricalSnapshotTemplate`, `buildSimpleSalesTemplate`, `buildMatrixMonthTemplate`, `targetTemplatesScoped` — DB-backed boutique scope, codes, employees where applicable.

## Overlap / legacy

- Multiple entry URLs still exist by design; hub consolidates **discovery + template download**. Upload remains on specialized pages to avoid duplicating canonical apply logic.
- `AdminImportClient.tsx` retained as reference; main `/admin/import` uses `ImportCenterClient`.

## Employee transfers

- Branch-scoped templates: same person may appear in Boutique A and Boutique B templates for different periods; parsers key on **boutique + date + identity** per existing import code (not “single branch for life”).

## Ledger vs SalesEntry (Policy A)

- Historical `HISTORICAL_IMPORT` / correction writes **SalesEntry only** — see **`docs/historical-ledger-reconciliation.md`**. Parity diagnostics are SalesEntry-only; ledger UI totals may differ.
