# Canonical Money Contract (NON-NEGOTIABLE)

All monetary values across server code, DB queries, API DTOs, and UI must follow this contract.

## Storage & APIs

- **DB: `SalesEntry.amount`** = halalas (int). Never store SAR in this column.
- **DB: Target tables** (`EmployeeMonthlyTarget.amount`, `BoutiqueMonthlyTarget.amount`) = SAR as integer (e.g. 2000 = 2000 SAR). Convert to halalas at read: `halalas = Math.round(amountSar * 100)`.
- **APIs:** All money fields in responses must be **halalas (int)**. No field named `*Sar` or `*SAR` should be returned for direct UI display unless documented as “display-only string”.
- **Never mix SAR and halalas in the same DTO.** One unit per response.

## UI

- **UI must NEVER format money with `toLocaleString()` or raw numbers.**
- **UI must display money ONLY via `formatSarFromHalala(halala)`** from `lib/utils/money.ts`.
- Any “SAR” values shown in the app must come from halalas (from API) then `formatSarFromHalala(value)`.

## Single source of truth: “My Sales Total”

- **My Sales total for a range** = `SUM(SalesEntry.amount)` for the scoped `userId` within `[from, toExclusive)` (Riyadh day boundaries).
- **MTD (month-to-date)** = same definition for the month: `SUM(SalesEntry.amount)` for that user in that month (Riyadh).
- `/api/metrics/sales-my` and `/api/metrics/my-target` use the same aggregator (`getSalesMetrics`, `getTargetMetrics`); MTD for a given month equals My Sales total when the range is that full month.

## Date ranges

- All date ranges use **Asia/Riyadh** day boundaries.
- Range is **inclusive [from, to]**; query uses **toExclusive = to + 1 day at 00:00 Riyadh**.
- Enforce **from ≤ to**; if client sends from > to, swap before querying.
- Display the **normalized** from/to in the UI (not raw inputs).
