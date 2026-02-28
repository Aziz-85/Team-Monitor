# STRICT PATCH — Canonical Money + Date Range (Deliverables)

## Before / After

| Page / API        | Before (bug)              | After (canonical)                    |
|-------------------|---------------------------|--------------------------------------|
| `/me/target` MTD  | 191,950 (halalas as SAR)  | 1,919.50 SAR (`formatSarFromHalala(191950)`) |
| `/me/target` Month total | Same 100× error          | 1,919.50 SAR                         |
| `/sales/my` Net   | 1,919.50 SAR (correct)    | 1,919.50 SAR (unchanged)             |
| `/dashboard` MTD  | 191,950 raw               | 1,919.50 SAR                         |
| API `monthTarget` / `currentMonthTarget` | Mixed (SAR in DB) | Halalas only (SAR × 100 at read)     |
| Date range `from > to` | Possible inverted range   | Swapped to `from ≤ to`; normalized Riyadh |

Alignment: For Feb 2026 with 191,950 halalas MTD, every page shows **1,919.50 SAR**.

---

## Changed Files (PR-ready)

- `docs/money_contract.md` — NEW: contract (DB/APIs/UI, single source MTD, dates).
- `docs/PATCH_MONEY_DATE_DELIVERABLES.md` — NEW: this file.
- `lib/metrics/aggregator.ts` — Target amounts: SAR → halalas at read (`SAR_TO_HALALAS`); all returned money in halalas.
- `app/api/metrics/sales-my/route.ts` — Date range: enforce `from ≤ to` (swap), normalize to Riyadh start-of-day; response `from`/`to` normalized.
- `__tests__/metrics-crosspage.test.ts` — Mocks: target amounts in SAR (100, 500) so aggregator returns 10000, 50000 halalas.

(UI already uses `formatSarFromHalala` everywhere for `/dashboard`, `/me/target`, `/sales/my`, `/sales/returns`, Home, Employee home — from previous patch.)

---

## Tests

- `npx jest __tests__/money.test.ts __tests__/metrics-aggregator.test.ts __tests__/metrics-crosspage.test.ts` — **all passing.**
- Smoke assertion: **My Sales net (Feb 2026 range) = My Target MTD (Feb 2026)** is enforced by same aggregator and same scope; API-level test in `metrics-crosspage.test.ts` asserts `GET /api/metrics/dashboard` and `GET /api/metrics/my-target` same MTD for same scope/month.
- Optional: Playwright E2E (log in as EMPLOYEE, open `/sales/my` and `/me/target`, assert displayed values match) can be added in a follow-up when Playwright is set up.

---

## Deployment / Runtime

- **Single PM2 user:** Ensure only one PM2 user runs `team-monitor` (no duplicate processes).
- After patch:
  ```bash
  npm ci && npm run build
  pm2 restart team-monitor --update-env
  ```
- Verify: UI footer version increments; `/api/metrics/my-target` and `/api/metrics/sales-my` return halalas; UI shows SAR via `formatSarFromHalala`.
