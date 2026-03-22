# Sales parity surface audit (P2)

## Canonical layer

- Reads: `lib/sales/readSalesAggregate.ts` → **SalesEntry**
- Writes / precedence: `lib/sales/upsertSalesEntry.ts`, `salesEntryWritePrecedence.ts`

## Surfaces mapped (business-critical totals)

| Surface | Scope | Helper / path |
|--------|--------|----------------|
| `GET /api/dashboard` | Boutique or employee month | `getPerformanceSummaryExtended` → `readSalesAggregate` |
| `GET /api/sales/summary` | Date range + boutique/employee | `aggregateSalesEntrySum` + inclusive date where |
| `GET /api/sales/monthly-matrix` | Boutique + month(s) + optional LEDGER | `salesEntryWhereForBoutiqueMonths` + client matrix build |
| `GET /api/me/sales` | Employee month (read) | `salesEntryWhereForUserMonth` |
| `GET /api/metrics/dashboard` | Boutique month sales KPIs | `getDashboardSalesMetrics` → `groupSalesByUserForBoutiqueMonth` |
| `GET /api/metrics/sales-my` | Range + optional monthly buckets | `getSalesMetrics` + `groupSalesSumByMonthForUser` |
| `GET /api/metrics/my-target` | Employee MTD / week / today | `getTargetMetrics` → `aggregateSalesEntrySum` |
| `GET /api/target/my/daily` | Employee achieved-to-date | `aggregateSalesEntrySum` + `salesEntryWhereForUserMonth` |
| `GET /api/target/boutique/daily` | Boutique month + day | `aggregateSalesEntrySum` + `salesEntryWhereForBoutiqueMonth` |

## Historical imports vs ledger (Policy A)

- **Policy:** `docs/historical-ledger-reconciliation.md` — historical `HISTORICAL_IMPORT` / `HISTORICAL_CORRECTION` rows exist **only** in **SalesEntry**; ledger is **not** backfilled.
- **Parity suite** (`lib/sales/parityEngine.ts`): **SalesEntry-only** contracts. It **never** compares SalesEntry totals to `BoutiqueSalesSummary` / `BoutiqueSalesLine`. A PASS here does **not** mean ledger equals SalesEntry for the month.
- **False alarm avoidance:** Do not treat “ledger UI ≠ SalesEntry total” as a parity failure; use **SalesEntry** for canonical reporting alignment.

## Semantics that must **not** be equated

- **Full month** (sum over `month` or full date range) vs **MTD** (`dateKey <= today`).
- **Matrix `includePreviousMonth=true`**: grand total spans two months — compare only to aggregates over the same months.
- **Matrix `source=LEDGER`**: only LEDGER rows — compare to aggregates with `source: 'LEDGER'`.
- **Executive `/api/executive/monthly`**: **mixed** — ledger aggregates + `salesEntryBySource`; KPI revenue uses ledger/manual rules — see `reconciliationPolicy` in JSON and `docs/historical-ledger-reconciliation.md`.
- **Other `/api/executive/*`** (main, compare, weekly-pdf, employees): **SalesEntry**-based aggregates unless noted in route comment.

## Obscure / export paths (not rewritten in P2)

| Path | Notes |
|------|--------|
| `app/api/executive/monthly/route.ts` | Ledger + manual lines + SalesEntry by source — specialized reconciliation |
| `app/api/executive/route.ts` | Raw `salesEntry.aggregate` for revenue |
| `app/api/executive/compare/route.ts` | `groupBy` boutique |
| `app/api/executive/weekly-pdf/route.ts` | `salesEntry.aggregate` |
| `app/api/executive/employees/*.ts` | `findMany` on SalesEntry |

**P3 follow-up:** optionally route executive “pure SalesEntry total” slices through `readSalesAggregate` for consistency; avoid changing executive business rules without product sign-off.

## Diagnostics

- **Admin:** `GET /api/admin/sales-parity-diagnostics?boutiqueId=&month=YYYY-MM` (ADMIN / SUPER_ADMIN).
- **Status:** `GET /api/admin/sales-parity-status` (same scope, compact JSON).
- **Overrides / sources:** `GET /api/admin/sales-overrides` (non-LEDGER rows + counts by `source`).
- **UI:** `/admin/sales-integrity` (ADMIN / SUPER_ADMIN) — runs parity checks on demand.
- **Governance registry:** `lib/sales/salesGovernance.ts` — approved surfaces + dev-only `devWarnSalesGovernance`.
- **Tests:** `__tests__/sales-integrity-parity.test.ts`, `__tests__/helpers/salesParity.ts`.

## P3 executive alignment

| Endpoint | Class | Notes |
|----------|--------|--------|
| `GET /api/executive` | A | Uses `aggregateSalesEntrySumForBoutiquesMonth`, `groupSalesSumByMonthForScopedBoutiques` |
| `GET /api/executive/compare` | A | `groupSalesSumByBoutiqueForMonth` |
| `GET /api/executive/weekly-pdf` | A | `aggregateSalesEntrySumForBoutiquesMonth` (full month of week’s month) |
| `GET /api/executive/monthly` | B | Ledger + SalesEntry; SalesEntry breakdown via `groupSalesEntryBySource` |
| `GET /api/executive/employees/[empId]` | A | `groupSalesSumByMonthForUserInBoutiquesYear` / `groupSalesSumByBoutiqueForUserYear` |
| `GET /api/executive/employees/annual` | C | Bulk `findMany` listing; documented |
