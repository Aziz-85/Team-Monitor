# Sales Source of Truth — Team Monitor

**Phase:** Architecture Stabilization Phase 1  
**Version:** v2.3.128+  
**Status:** Active policy  
**Related:** `AUDIT.md`, `lib/sales/index.ts`, `lib/sales/salesGovernance.ts`

---

## 1. Executive Decision

Team Monitor uses a **two-layer sales model** with one canonical read surface:

| Layer | Primary models | Role |
|-------|----------------|------|
| **Operational write (daily)** | `BoutiqueSalesSummary`, `BoutiqueSalesLine` | Manager daily entry, matrix/yearly ledger imports, lock/reconcile |
| **Canonical read + KPI write** | `SalesEntry` | Dashboard, Performance Hub, targets vs actual, employee/month totals |
| **Transaction detail (parallel)** | `SalesTransaction`, `SalesLedgerBatch` | Row-level txn import, returns/exchanges — **not auto-synced to SalesEntry in v2.3** |
| **Import audit** | `SalesEntryImportBatch`, `SalesImportBatch` | Rollback, dedup, apply tracing |

### Canonical rules

1. **`SalesEntry` is the single source of truth for business KPIs** (integer SAR, `dateKey` Riyadh).
2. **Daily ledger is the single source of truth for manager operational entry** — must sync to `SalesEntry` via `syncSalesProjections`.
3. **Direct canonical writes** (admin MSR, historical, secure matrix) go only through `updateBoutiqueSale` → `upsertCanonicalSalesEntry`.
4. **No route may write `SalesEntry` or ledger lines without a service in `lib/sales/`**.
5. **Sale ownership = boutique where the file was uploaded / operational scope on server** — never inferred from employee's current boutique alone.

---

## 2. Model Reference

### 2.1 SalesEntry (canonical)

```prisma
@@unique([boutiqueId, dateKey, userId])
```

| Field | Meaning |
|-------|---------|
| `boutiqueId` | **Sale location** (where transaction occurred) |
| `userId` | **Seller** (User.id) |
| `dateKey` | `YYYY-MM-DD` Riyadh |
| `amount` | Integer SAR |
| `source` | Last write origin (precedence in `salesEntryWritePrecedence.ts`) |

**Readers:** `readSalesAggregate.ts`, `metrics/aggregator.ts`, `performance/hubEngine.ts`, `attribution.ts`  
**Writers:** Only via `upsertCanonicalSalesEntry` or ledger sync (`syncSalesProjections`)

### 2.2 BoutiqueSalesSummary + BoutiqueSalesLine (operational ledger)

| Model | Purpose |
|-------|---------|
| `BoutiqueSalesSummary` | One row per boutique+day; `totalSar`, `status` (DRAFT/LOCKED) |
| `BoutiqueSalesLine` | One row per employee per day; `amountSar`, `source` (MANUAL/EXCEL_IMPORT/YEARLY_IMPORT) |

**Sync:** After any ledger mutation → `syncSalesProjections({ boutiqueId, date, actorUserId })`

### 2.3 SalesTransaction (transaction ledger)

Row-level SALE / RETURN / EXCHANGE from Excel txn import. Stored in halalas (`netAmount`).  
**Policy (Phase 1):** Does **not** auto-project to `SalesEntry`. Executive monthly may read ledger separately (`docs/historical-ledger-reconciliation.md`).  
**Deferred (Phase 1+):** Optional `syncTransactionProjections` — requires product sign-off.

### 2.4 Import batch models

| Model | Pipeline |
|-------|----------|
| `SalesImportBatch` | Daily matrix import (ledger) |
| `SalesEntryImportBatch` | MSR / yearly / admin direct SalesEntry imports (`fileSha256`) |
| `SalesLedgerBatch` | Transaction import (`fileHash`) |

---

## 3. Write Path Map

All writes must flow through `lib/sales/`:

```
┌─────────────────────────────────────────────────────────────────┐
│                     APPROVED WRITE PATHS                         │
└─────────────────────────────────────────────────────────────────┘

Manual daily line (manager)
  recordBoutiqueSale()
    → BoutiqueSalesLine
    → syncSalesProjectionsFromSummary()
    → SalesEntry (source=LEDGER)

Delete daily line
  removeBoutiqueSaleLine()
    → syncSalesProjectionsFromSummary()

Matrix / yearly / monthly-sheet import
  [existing parser]
    → BoutiqueSalesLine (+ Summary)
    → importBoutiqueSales() / importBoutiqueSalesSyncBatch()

Admin MSR / historical / secure matrix
  [existing parser]
    → updateBoutiqueSale() → SalesEntry (direct)

Branch daily total (admin)
  updateBoutiqueSale(source=BRANCH_DAILY_TOTAL)

Transaction import
  [import-ledger route]
    → SalesTransaction only (documented exception)

Ledger repair / backfill
  rebuildSalesProjections() / rebuildSalesProjectionsForMonth()
```

### Source precedence (SalesEntry overwrites)

Defined in `lib/sales/salesEntryWritePrecedence.ts`:

```
MANUAL > LEDGER > EXCEL_IMPORT > MATRIX > … > HISTORICAL_IMPORT
```

Admin `forceAdminOverride` bypasses precedence (RBAC required).

---

## 4. Read Path Map

| Surface | Helper | Model |
|---------|--------|-------|
| Dashboard KPIs | `getSalesMetricsFromSalesEntry`, `getPerformanceSummaryExtended` | SalesEntry |
| Sales summary API | `aggregateSalesEntrySum` | SalesEntry |
| Performance Hub | `hubEngine` + `readSalesAggregate` | SalesEntry |
| My sales / employee MTD | `salesEntryWhereForUserMonth` | SalesEntry |
| Boutique total | `sumBoutiqueSales` (`attribution.ts`) | SalesEntry |
| Employee total (all branches) | `sumEmployeeSales` | SalesEntry |
| Executive compare | `groupSalesSumByBoutiqueForMonth` | SalesEntry |
| Executive monthly (mixed) | Ledger revenue + SalesEntry breakdown | **Mixed — see §7** |
| Returns UI | `SalesTransaction` query | SalesTransaction |

**Rule:** New business-facing totals must use `readSalesAggregate` or `attribution.ts`. Register in `salesGovernance.ts`.

---

## 5. Input Priority & Behaviors

### 5.1 Input source priority

| Priority | Source | Writes to | Sync to SalesEntry |
|----------|--------|-----------|-------------------|
| 1 | Manual daily line | Ledger | Yes (LEDGER) |
| 2 | Matrix Excel (manager) | Ledger | Yes (MATRIX or override) |
| 3 | Yearly employee Excel | Ledger + batch audit | Yes (YEARLY_IMPORT / override) |
| 4 | Admin MSR Excel | SalesEntry direct | N/A |
| 5 | Historical initial/correction | SalesEntry direct | N/A |
| 6 | Secure matrix edit | SalesEntry direct | N/A |
| 7 | Transaction Excel | SalesTransaction | **No (Phase 1)** |

### 5.2 Manual entry

- Route: `POST /api/sales/daily/lines`
- Service: `recordBoutiqueSale({ requireEmployeeInBoutique: true })`
- Employee **must** belong to operational boutique (security — blocks cross-boutique manual write)
- Locked days: auto-unlock with `SalesLedgerAudit` POST_LOCK_EDIT

### 5.3 Import entry

- Sale stays on **server-resolved `boutiqueId`** (trusted operational scope)
- Employee historical boutique mismatch → **warning only** (`collectImportSalesWarnings`)
- Employee in multiple boutiques same day → **warning only**
- Re-import same file: `SalesEntryImportBatch.fileSha256` / `SalesLedgerBatch.fileHash` dedup (per pipeline)

### 5.4 Re-import same day

- Ledger path: upsert line by `(summaryId, employeeId)`; sync replaces SalesEntry rows for that source
- Direct SalesEntry path: `upsertCanonicalSalesEntry` + precedence rules
- Locked summary: imports may auto-unlock (audited) — known behavior, flagged in AUDIT.md C5

### 5.5 Employee transfer

- **Do not rewrite** historical `SalesEntry.boutiqueId`
- Employee totals: sum by `userId` across all boutiques
- Boutique totals: sum by `boutiqueId` (sale location)
- Guest coverage: sale location = host boutique

### 5.6 Returns / negative amounts

- `SalesEntry.amount` must be **non-negative integer** (upsert validation)
- Returns live in `SalesTransaction` with negative `netAmount` (halalas)
- KPI totals from SalesEntry **exclude** txn-layer returns until sync policy is defined

### 5.7 Delete / edit policy

| Action | Policy |
|--------|--------|
| Delete ledger line | `removeBoutiqueSaleLine` → removes SalesEntry row for that user+day+LEDGER source |
| Edit canonical (manual) | `updateBoutiqueSale` — respects lock + precedence |
| Admin rollback | `SalesEntryImportBatch` rollback routes |
| Locked day edit | Auto-unlock + audit (manager/import) |

---

## 6. Service API (`lib/sales/`)

| Function | Responsibility |
|----------|----------------|
| `recordBoutiqueSale` | Upsert ledger line + audit + sync |
| `removeBoutiqueSaleLine` | Delete ledger line + sync |
| `updateBoutiqueSale` | Direct canonical upsert |
| `importBoutiqueSales` | Post-import single-day sync |
| `importBoutiqueSalesSyncBatch` | Post-import multi-day sync |
| `syncSalesProjections` | Ledger → SalesEntry for one day |
| `syncSalesProjectionsFromSummary` | Sync when summary id known |
| `rebuildSalesProjections` | Date-range repair |
| `calculateEmployeePerformance` | SalesEntry + target + achievement % |
| `calculateBoutiquePerformance` | Boutique SalesEntry + target |
| `collectImportSalesWarnings` | Non-blocking ownership warnings |

---

## 7. Known Exceptions & Deferred Items

| Item | Status | Notes |
|------|--------|-------|
| SalesTransaction → SalesEntry sync | **Deferred** | Documented; executive/monthly uses mixed sources |
| Executive monthly revenue | **Mixed** | `salesGovernance.ts` — not in pure parity suite |
| MSR import boutique fallback | **Risk H6** | Hardcoded `bout_dhhrn_001` fallback if mapping fails |
| Import auto-unlock LOCKED days | **Known** | Audited via SalesLedgerAudit |

---

## 8. Performance Calculation

```
Employee sales total = SUM(SalesEntry.amount) WHERE userId = ? AND dateKey IN range

Boutique sales total = SUM(SalesEntry.amount) WHERE boutiqueId = ? AND dateKey IN range

Achievement % = target > 0 ? round(sales * 100 / target) : 0
Remaining = target - sales
```

Implemented in:
- `calculatePerformance()` — pure math
- `calculateEmployeePerformance()` / `calculateBoutiquePerformance()` — service layer
- `getTargetMetrics()` — existing dashboard (unchanged behavior)

Missing target → `targetStatus: 'missing'` in new services (not forced zero without flag).

---

## 9. Migration & Rollback

**No schema migration in Phase 1.**  
Rollback = revert code; data unchanged.  
Import rollback = existing `SalesEntryImportBatch` rollback routes.

---

## 10. Regression Tests

| Test file | Covers |
|-----------|--------|
| `sales-entry-write-precedence.test.ts` | Source precedence |
| `sales-integrity-parity.test.ts` | Cross-surface parity |
| `sales-source-of-truth.test.ts` | Service layer + performance math |
| `sales-ownership-warnings.test.ts` | Warning rules |

---

## 11. Route Migration Checklist (Phase 1)

| Route | Service | Status |
|-------|---------|--------|
| `POST/DELETE /api/sales/daily/lines` | `recordBoutiqueSale`, `removeBoutiqueSaleLine` | ✅ Phase 1 |
| `POST /api/sales/daily/summary` | `syncSalesProjections` | ✅ Phase 1 |
| `POST /api/admin/sales/repair` | `rebuildSalesProjections` | ✅ Phase 1 |
| Other import/apply routes | `importBoutiqueSalesSyncBatch` | Re-export available; migrate Phase 4 |
| Admin MSR / historical | `updateBoutiqueSale` | Re-export available; migrate incrementally |

---

## Appendix: Legacy `source` values

DB may contain legacy strings (`IMPORT`, `MONTHLY_MATRIX_TRACE_V9`, etc.).  
**Reads must not filter them out.** Precedence ranks unknown sources conservatively (see `getSalesEntrySourceRank`).
