# Production Stability Checklist

Use this checklist before and after deployments to verify critical flows.

---

## Cross-boutique guest coverage (schedule)

**Feature:** A host boutique (e.g. Al Rashid) can show coverage shifts performed by employees whose home boutique is different (e.g. Dhahran Mall), on specific dates only. `Employee.boutiqueId` is never changed; guest coverage is per-date assignment to the host boutique.

### Test case: Guest on one day, counts in totals

1. **Setup**
   - Ensure two boutiques exist (e.g. Dhahran, Al Rashid) with distinct employees.
   - Log in as ADMIN or MANAGER with operational scope set to **Al Rashid** (host).

2. **Add guest**
   - Open **Schedule (View)** and select a week. Switch to **Grid** view if needed.
   - Click **Add External Coverage** (or "إضافة تغطية خارجية").
   - Choose an employee whose home boutique is **Dhahran** (not Al Rashid).
   - Select **Tuesday**, shift **AM**, and a reason (e.g. "Coverage / visit").
   - Submit.

3. **Verify (Option 1: External Coverage section)**
   - The **base roster** shows only Al Rashid employees (no guest rows in the main table).
   - At the bottom of the grid, the **External Coverage** row appears.
   - The Dhahran employee appears **only in the Tuesday column** under External Coverage (name + "Guest (HOME_CODE)" + AM).
   - Other day columns have no entry for this guest.
   - **Tuesday AM** total for Al Rashid includes this guest (count +1).
   - Switching to **Dhahran** schedule does **not** show this assignment (host is Al Rashid).
   - Employee list in Admin → Employees is unchanged; the employee’s home boutique is still Dhahran.

4. **APIs (optional)**
   - `GET /api/schedule/guests?weekStart=YYYY-MM-DD` returns the guest shift(s) for the host boutique in that week.
   - `DELETE /api/schedule/guests?id=<overrideId>` removes the guest shift; the row disappears from the host week after refresh.

---

## Monthly Sales Matrix

**Feature:** Operational page (ADMIN/MANAGER) showing employee × day sales for the selected month; data from SalesEntry only; scoped to operational boutique.

### Test case: Matrix matches ledger and totals

1. **Setup**
   - Log in as ADMIN or MANAGER with operational boutique set (e.g. Dhahran).
   - Ensure the selected month has at least one day with ledger data (Daily Sales Ledger).

2. **Open matrix**
   - Go to **Sales → Monthly Matrix** (or "مصفوفة شهرية").
   - Select the month that has ledger data.

3. **Verify**
   - **Working on** (or "تعمل على") shows the operational boutique name.
   - Rows = employees of that boutique (stable order: empId, name).
   - Columns = days 1..end of month; day windows (1–7, 8–14, …) switch correctly.
   - Each cell shows SAR amount or 0; values match Daily Sales Ledger / SalesEntry for that employee and day.
   - **Row total** (last column) = sum of that row’s cells.
   - **Footer row (Day total)** = sum per day; **Grand total** (last cell) = sum of all.
   - Sum of row totals = grand total; sum of column totals = grand total.
   - Search by empId/name filters rows; "Only with sales" hides zero-total rows.

4. **Scope**
   - Change operational boutique (scope selector); reload matrix. Rows and data change to the new boutique only.

---

## Sales repair and sync (dateKey)

**Feature:** SalesEntry is synced from the Daily Sales Ledger by **dateKey** (YYYY-MM-DD Riyadh). Repair syncs **only real ledger dates** (dates that exist in BoutiqueSalesSummary in the range), not a naive day loop. Sync finds summary by day range (Riyadh) to avoid DateTime mismatch.

### Test case: Repair Feb range, then verify dashboard and matrix

1. **Repair**
   - As ADMIN: `GET /api/admin/sales/repair?from=2026-02-01&to=2026-02-29&boutiqueId=bout_rashid_001` (or your boutique id; omit `boutiqueId` to run for all active boutiques).
2. **Assert**
   - Response: `mismatchDatesAfter` is `[]`.
   - Response: `ledgerLinesSum === salesEntrySumAfter`.
3. **Validate (optional)**
   - `GET /api/admin/sales/validate?month=2026-02&boutiqueId=bout_rashid_001`: `mismatch === false`, `mismatchDates` empty.
4. **Dashboard**
   - Dashboard for that boutique+month with `?debug=1`: `salesEntrySumMTD === ledgerLinesSumMTD`, `mismatchDatesSample` empty.
5. **Monthly Matrix**
   - Sales → Monthly Matrix for 2026-02: daily cells show values (not all zeros); grand total equals ledger total.

---

## Other checks

- [ ] Login and session (including `User.boutiqueId`) work after migrations.
- [ ] Schedule view and edit load without 500s; grid and counts match expectations.
- [ ] `npx prisma migrate deploy` and `npx prisma generate` run on the server after pull.
