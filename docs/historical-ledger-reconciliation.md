# Historical imports vs Daily Sales Ledger — reconciliation policy

## Policy **A** (active): Historical canonical imports are **SalesEntry-only**

**Decision:** Admin historical initial/correction imports (`HISTORICAL_IMPORT` / `HISTORICAL_CORRECTION`) write **only** through `upsertCanonicalSalesEntry`. They **do not** create or update `BoutiqueSalesSummary` / `BoutiqueSalesLine`.

### Why

- **Smallest blast radius:** avoids double-writing and conflicting sources on ledger lines.
- **Preserves historical truth** in the **canonical read model** (`SalesEntry`) without retroactively fabricating operational ledger history.
- **Aligns with existing architecture:** reporting and parity tooling already treat **SalesEntry** as the canonical layer (`readSalesAggregate`, `parityEngine`).

### What this implies

| Layer | Role |
|--------|------|
| **SalesEntry** | Canonical **read** model for dashboard, matrix totals, most APIs in `salesGovernance`, and **parity diagnostics**. Includes `HISTORICAL_IMPORT` rows. |
| **BoutiqueSalesSummary / BoutiqueSalesLine** | **Operational** daily ledger (entry UI, locks, yearly import path that syncs → `LEDGER` on SE). |
| **Historical JSON snapshots** | Files only — not SalesEntry (see `docs/historical-sales-import.md`). |

### Expected “mismatches” (not bugs)

- **Ledger-only screens** (totals from summaries/lines) may show **less** revenue than **SalesEntry** month aggregates if historical backfill added **only** `HISTORICAL_IMPORT` rows for some days.
- **`calculateBoutiqueScore`** (`lib/executive/score.ts`) uses **ledger summary** `_sum.totalSar` for its revenue component — it can diverge from pure SalesEntry month sum when historical-only SE rows exist.
- **`GET /api/executive/monthly`** intentionally exposes **both** ledger aggregates and `salesEntryBySource`; KPI `revenue` uses **ledger/manual reconciliation** rules — **not** a second copy of the SalesEntry total.

### Parity diagnostics

- **`runCoreParitySuite`** compares **SalesEntry-backed** helpers only. It **does not** assert `SalesEntry.sum === ledger.sum`. That gap under Policy A can be **expected** when historical imports are present.

### Operational yearly import (unchanged)

- `POST /api/sales/import/yearly` writes **ledger** then **sync** → SalesEntry as **LEDGER**. That path remains the ledger-first workflow.

### Future (out of scope here)

- Policy B (mirror historical into ledger) would require idempotent ledger line upserts and careful lock/source semantics — only if product mandates ledger parity for backfilled periods.
