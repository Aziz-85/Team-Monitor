/**
 * Sales parity contracts — explicit semantics for integrity tests and diagnostics.
 *
 * **Canonical reads:** `lib/sales/readSalesAggregate.ts` over **SalesEntry** (all sources unless noted).
 *
 * Do **not** assert equality across different business definitions:
 * - **Full month** = sum of SalesEntry rows with `month = YYYY-MM` (no dateKey cap).
 * - **MTD** = same where + `dateKey <= today` (Riyadh `todayStr`).
 * - **Matrix `grandTotalSar`** = sum of matrix cells; equals sum of entry amounts that have `User.empId`
 *   for rows included in the matrix query. May be **strictly less** than boutique month aggregate if
 *   orphan rows exist (no empId). When all rows have empId, grand total matches aggregate for same
 *   `salesEntryWhereForBoutiqueMonths` scope.
 * - **Matrix `source=LEDGER`** filters `source = 'LEDGER'`; **ALL** does not — parity vs summary must use
 *   the same source filter.
 * - **Employee cross-boutique:** `salesEntryWhereForUserMonth(userId, month, null)` = all boutiques;
 *   single-boutique adds `boutiqueId` to the where clause.
 * - **Ledger vs SalesEntry:** contracts are **SalesEntry-only**. Do not FAIL parity because
 *   `BoutiqueSalesSummary` totals differ from SalesEntry — see `docs/historical-ledger-reconciliation.md`.
 */

/** Contract A — boutique full month total must match across aggregate and groupBy (same where). */
export const CONTRACT_BOUTIQUE_MONTH_AGGREGATE_VS_GROUPBY = 'BoutiqueMonth_AggregateEqualsGroupBySum';

/** Contract A2 — full month total vs dashboard `currentMonthActual` (boutique scope, not employee-only). */
export const CONTRACT_BOUTIQUE_MONTH_VS_DASHBOARD = 'BoutiqueMonth_AggregateEqualsDashboardActual';

/** Contract B — employee MTD must match `getTargetMetrics.mtdSales` (same scope flags). */
export const CONTRACT_EMPLOYEE_MTD_VS_TARGET_METRICS = 'EmployeeMtd_EqualsGetTargetMetrics';

/** Contract C — matrix scope total (ALL, single month, no previous month) vs aggregate for that scope. */
export const CONTRACT_MATRIX_SCOPE_VS_AGGREGATE = 'MatrixScopeGrandTotal_EqualsAggregate';

/** Contract D — `month` column vs `date` range for the same calendar month (data consistency). */
export const CONTRACT_BOUTIQUE_MONTH_COLUMN_VS_DATE = 'BoutiqueMonth_ColumnEqualsDateRange';
