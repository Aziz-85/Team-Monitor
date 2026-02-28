# Sales Data Flow Map

Single source of truth: **SalesEntry** for all analytics. Daily Sales Ledger writes to BoutiqueSalesSummary + BoutiqueSalesLine, then sync copies into SalesEntry.

---

## 1) Data Entry

### Daily Sales Ledger UI

- **Where:** `/sales/daily` (Sales Daily Ledger).
- **Who:** Manager (or Admin) enters:
  - **Summary:** `totalSar` (manager total for the day), optional reason.
  - **Lines:** Per-employee amounts (`employeeId` = empId, `amountSar` in SAR).
- **Scope:** One boutique per ledger view; date and boutique are fixed per request.

---

## 2) Persistence (Ledger Writes)

All writes go to the **ledger** tables first (not directly to SalesEntry).

| Table | Key fields | Written when |
|-------|------------|--------------|
| **BoutiqueSalesSummary** | `boutiqueId`, `date`, `totalSar`, `status` (DRAFT/LOCKED), `lockedAt`, `enteredById`, `lockedById` | Create/update summary; lock day |
| **BoutiqueSalesLine** | `summaryId`, `employeeId` (empId), `amountSar`, `source` (MANUAL/EXCEL_IMPORT), `importBatchId` | Add/update/delete line; import apply |

- **Unique:** One summary per `(boutiqueId, date)`.
- **Lines:** One line per `(summaryId, employeeId)`; lines reference empId, not userId.

---

## 3) Sync (Ledger → SalesEntry)

SalesEntry is the **read model** for analytics. It is updated only via sync from the ledger.

### When sync runs (routes that call sync)

| Route | When | Effect |
|-------|------|--------|
| `POST /api/sales/daily/lines` | Add/update/delete a line | `syncSummaryToSalesEntry(summary.id)` |
| `POST /api/sales/import/apply` | Apply import batch | `syncSummaryToSalesEntry(summary.id)` |
| `POST /api/sales/daily/lock` | Lock day | `syncSummaryToSalesEntry(summary.id)` |
| `POST /api/sales/daily/summary` | Create/update summary (e.g. totalSar) | `syncDailyLedgerToSalesEntry({ boutiqueId, date, actorUserId })` |
| `GET/POST /api/admin/sales/repair` | Admin repair date range | `syncDailyLedgerToSalesEntry` per date + boutique |

### Sync output (what gets written to SalesEntry)

- **Day key:** Sync uses **dateKey** (string `YYYY-MM-DD` in Asia/Riyadh from `formatDateRiyadh(date)`) so all lookups and deletes are date-only and timezone-safe.
- **Upsert** one `SalesEntry` per ledger line that has a mapped User (unique key: `boutiqueId` + **`dateKey`** + `userId`):
  - `userId` = User.id (resolved from BoutiqueSalesLine.employeeId via User.empId)
  - `date` = normalized date-only (DB); `dateKey` = **YYYY-MM-DD** Riyadh from `formatDateRiyadh(date)`
  - `month` = **YYYY-MM** from `formatMonthKey(date)` in **Asia/Riyadh**
  - `boutiqueId` = summary.boutiqueId
  - `amount` = line.amountSar
  - `source` = **'LEDGER'** (safe delete targets these only)
  - `createdById` = actor
- **Delete (safe):** Only rows with `source = 'LEDGER'` for that **exact** `(boutiqueId, dateKey)` whose `userId` is not in the current line userIds. No other rows deleted by sync.
- **No summary for that day+boutique:** Sync deletes all SalesEntry for that `(boutiqueId, dateKey)` with `source = 'LEDGER'`.
- **Lines with no User** (empId not in User.empId) are **skipped**; they are not written to SalesEntry (and contribute to “unmapped” / skipped count).

---

## 4) Analytics Reads (Single Source: SalesEntry)

All of the following read **only** from **SalesEntry** (never directly from BoutiqueSalesSummary/BoutiqueSalesLine for totals):

| Consumer | Filter | Usage |
|----------|--------|--------|
| **Dashboard** (`/api/dashboard`) | `boutiqueId` (operational), `month` = Riyadh monthKey | MTD actual, completion %, sales breakdown, team table |
| **Executive Monthly** | `boutiqueId`(s), `month` | Revenue, targets, achievement |
| **Targets / progress** | `boutiqueId`, `month` | Boutique and employee target vs actual |
| **Employee Intelligence** | `userId`, `boutiqueId`, `month` | Per-employee sales |

No cross-boutique mixing: analytics always filter by a single operational `boutiqueId` (and `monthKey`) unless an admin report explicitly requests a different scope.

---

## 5) Aggregations

- **Daily total (one day):**  
  `sum(SalesEntry.amount)` where `dateKey = 'YYYY-MM-DD'` (and `boutiqueId = B`). Prefer `dateKey` over `date` for day-scoped logic.

- **MTD total (month):**  
  `sum(SalesEntry.amount)` where `month = YYYY-MM` (Riyadh) and `boutiqueId = B`.

- **Per-employee MTD:**  
  `groupBy userId`, same filters `month` + `boutiqueId`, then `sum(amount)` per user.

- **Achievement %:**  
  `(MTD boutique sales from SalesEntry) / (boutique target for that month)`.

Month key is always derived in **Asia/Riyadh** via `formatMonthKey(...)` to avoid UTC month drift.

---

## 6) Data Scope Rules

- **Operational pages (dashboard, ledger, targets for “my” boutique):**  
  Filter by **operational** `boutiqueId` only (single boutique from scope).

- **Admin reports:**  
  Global or multi-boutique only when explicitly requested (e.g. repair all boutiques); normal dashboard/executive views still use single-boutique scope.

- **Unmapped lines:**  
  Ledger lines whose `employeeId` (empId) has no matching User are skipped in sync; they do not appear in SalesEntry. Dashboard debug can show “unmapped lines count” for the current month+boutique so totals can be explained.

---

## 7) Sync guarantees (CRITICAL)

- **Date key:** Sync operates on **dateKey** (string `YYYY-MM-DD` from **`formatDateRiyadh(date)`** in Asia/Riyadh). All upserts and safe deletes use `(boutiqueId, dateKey, userId)` so there is no timezone drift.
- **Uniqueness:** SalesEntry has **`@@unique([boutiqueId, dateKey, userId])`**. Sync upserts using this key; one row per boutique+day+user from the ledger.
- **Source:** SalesEntry has **`source`** (e.g. `'LEDGER'`). Sync sets `source = 'LEDGER'` on create/update. Stale deletes and "no summary" cleanup **only** target rows with `source = 'LEDGER'` for that exact `dateKey`+`boutiqueId`. Other sources (e.g. MANUAL, IMPORT) are never deleted by ledger sync.
- **Idempotent:** Running sync again for the same day+boutique leaves SalesEntry in the same state (upsert + safe delete only LEDGER rows for that dateKey).
- **Repair:** `/api/admin/sales/repair?from=YYYY-MM-DD&to=YYYY-MM-DD&boutiqueId=optional` runs sync **only on real ledger dates** (distinct dates found in BoutiqueSalesSummary in range). If `boutiqueId` is omitted, all active boutiques are processed. Returns **ledgerDatesFound**, **repairedCount**, **ledgerLinesSum**, **salesEntrySumAfter**, **mismatchDatesAfter**. After repair, **mismatchDatesAfter** must be empty and dashboard MTD must match.
- **Lookup by day range:** When resolving a summary for a given day, sync uses Riyadh day range (`date >= dayStart AND date < dayEnd`) so DateTime storage does not cause missed days.
- **Validate (debug):** `GET /api/admin/sales/validate?month=YYYY-MM&boutiqueId=...` (ADMIN) returns ledgerLinesSumMTD, salesEntrySumMTD, mismatchDates (all) for quick checks.

---

## 8) Acceptance test (e.g. February)

1. **Repair:** `GET /api/admin/sales/repair?from=2026-02-01&to=2026-02-29&boutiqueId=bout_rashid_001` as ADMIN.
2. **Assert:** `mismatchDatesAfter` is `[]`, and `ledgerLinesSum === salesEntrySumAfter`.
3. **Dashboard:** Open `/api/dashboard?debug=1` for that boutique+month: `salesEntrySumMTD === ledgerLinesSumMTD`, `mismatch === false`, `mismatchDatesSample` empty.
4. **Monthly Matrix:** Open Sales → Monthly Matrix for 2026-02: daily cells show values on correct dates; grand total equals ledger total for the month.
