# Phase 2 Verification Checklist

Use this checklist to verify Phase 2 (Multi-Boutique Scope + Daily Sales Ledger + Executive Intelligence) in production or staging.

## 1. Scope by role

- [ ] **EMPLOYEE**: Log in as EMPLOYEE. Header shows scope badge only; no region/group/selection dropdown.
- [ ] **ASSISTANT_MANAGER**: Same as EMPLOYEE — badge only, no scope selector.
- [ ] **MANAGER**: Log in as MANAGER. Can open scope selector and change to Boutique / Region / Group / Custom selection. Dashboard and data aggregate by selected scope.
- [ ] **ADMIN**: Same as MANAGER — full scope selector and aggregation.

## 2. Daily Sales Ledger (`/sales/daily`)

- [ ] **Access**: Only ADMIN and MANAGER see "Sales Daily" in nav and can open `/sales/daily`. Others get redirected.
- [ ] **Date**: Use date picker and Prev/Next; data loads for selected date. Scope badge shows current scope.
- [ ] **Per-boutique card**: Each boutique in scope has a card. If no summary yet, card shows manager total 0 and empty lines.
- [ ] **Set manager total**: Enter integer SAR and Save. Summary is created/updated (DRAFT). No decimals accepted.
- [ ] **Add line**: Enter Employee ID (empId) and Amount (integer SAR), click Add. Line appears; lines total and diff update.
- [ ] **Edit line**: Change amount and Save. Diff updates. If summary was LOCKED, saving a line triggers auto-unlock (status back to DRAFT).
- [ ] **Diff**: When lines total ≠ manager total, diff is shown (positive or negative). Message: "Cannot lock until lines total equals manager total (diff = 0)."
- [ ] **Lock**: Lock button is disabled when diff ≠ 0. When diff = 0, click Lock; status becomes LOCKED.
- [ ] **Post-lock edit**: After lock, editing a line or applying an import unlocks the summary (DRAFT) and writes audit.

## 3. Excel import

- [ ] **Upload**: On a boutique card, click "Import Excel". Choose file with columns for employee (empId / Name) and amount (integer). Upload.
- [ ] **Preview**: Response shows manager total, lines total, diff, row count. If diff ≠ 0, "Apply" may be disabled or apply endpoint returns error.
- [ ] **Apply**: When diff = 0, click Apply. Lines are upserted and batch recorded. Table and totals refresh.

## 4. Executive intelligence

- [ ] **Employee sales from ledger**: Open Executive → Employee Intelligence (or equivalent). Sales WTD/MTD per employee should reflect **BoutiqueSalesLine** data (daily ledger), not only legacy SalesEntry.
- [ ] **Scope**: Change scope (e.g. Region or Group) as MANAGER/ADMIN. Executive aggregates sales across the selected boutiques only.

## 5. Safety

- [ ] **Decimals**: Try entering or importing a decimal SAR amount; must be rejected (validation error).
- [ ] **Out-of-scope boutique**: As MANAGER with one boutique, try calling API with another boutiqueId; must get 403 or "Boutique not in your scope".
- [ ] **Role**: As EMPLOYEE, try POST `/api/sales/daily/summary` or `/lock`; must get 403.

## Quick API checks (with auth cookie)

- `GET /api/sales/daily?date=YYYY-MM-DD` — returns scope and summaries for boutiques in scope.
- `POST /api/sales/daily/summary` with `{ boutiqueId, date, totalSar }` — create/update summary (ADMIN/MANAGER).
- `POST /api/sales/daily/lock` with `{ boutiqueId, date }` — returns 400 if diff ≠ 0; 200 and LOCKED if diff = 0.

---

**Migrations**: Run `npx prisma migrate deploy` for `20260222000000_daily_sales_ledger_and_user_preference_updated_at` (and any earlier Phase 2 migrations) before verification.
