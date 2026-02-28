# Sales targets – test checklist

## Admin flow

1. Log in as **Manager** or **Admin**.
2. Go to **/admin/targets**. Select a month (e.g. current YYYY-MM).
3. **Boutique target:** Enter amount (SAR), click Save. Status badge should show "Set".
4. **Generate:** Click "Generate Employee Targets". Table should list employees with Role, Weight, Active, Monthly Target, MTD/Today/Week columns. Targets must follow role weights (Manager 0.5, Assistant Manager 0.75, High Jewellery Expert 2.0, Senior Sales Advisor 1.5, Sales Advisor 1.0).
5. **Override:** Click an employee’s Monthly Target, change value, blur or Enter. Value should update.
6. **Re-generate:** Click "Re-generate from Boutique Target". Confirm in modal. All targets should recompute; overrides are lost.
7. **Import (simple):** Upload a .xlsx with columns **date** (YYYY-MM-DD), **email**, **amount**. Response: importedCount, updatedCount, skippedCount, skipped[].
8. **Import (wide):** Upload a file with a sheet named **Data**: first row = header (date column + employee names). Rows = dates, cells = amounts. Response should include counts; unmatched columns in skipped.

## Employee flow

1. Log in as **Employee** (or any role).
2. Go to **/me/target**. Tabs: Daily / Weekly / Monthly. Enter a sale: pick today’s date, amount, Save. Entry appears in "Last 7 days" with delete button.
3. Change date to **yesterday**: enter amount, Save. Entry appears; delete allowed.
4. Change date to **3 days ago**: enter amount, Save. API should allow (if Manager/Admin) or reject (if Employee). For Employee, only today/yesterday are allowed; older dates should show "(read-only)" in Last 7 days and no delete.
5. **Policy tooltip:** On entries older than yesterday (for non-Manager/Admin), tooltip/text: "You can only edit or delete sales for today and yesterday."

## Cross-month weekly correctness

- **Example:** Month = 2026-02. Week containing 2026-02-28 (Saturday) runs 2026-02-28–2026-03-06. Intersection with February = **1 day** (28th only). So **week target for February** = 1 × dailyTarget, **week sales for February** = sum of sales on 2026-02-28 only.
- **Check:** In admin targets, select 2026-02. For an employee with monthly target 30,000 SAR, daily target = 30,000/28 ≈ 1071. For the week that contains only 2026-02-28, week target should be ~1071 and week sales = that day’s entry only.
- Run `npx ts-node -r tsconfig-paths/register scripts/verify-time-utils.ts` to verify week/month intersection logic.

## Import tests (both modes)

- **Simple:** Create .xlsx with header row `date`, `email`, `amount` and 2–3 data rows (valid dates, existing employee emails, numeric amounts). Import; expect importedCount or updatedCount ≥ 1, skippedCount 0 or with clear reasons.
- **Wide:** Create .xlsx with a sheet named **Data**, first row e.g. `date`, `Employee A`, `Employee B` (names matching Employee.name or email), next rows = date + two columns with numbers. Import; expect counts; unmatched columns in skipped with reason (e.g. unknown employee).

## Production migration steps

1. Apply migrations: `npx prisma migrate deploy` (includes `20260215100000_sales_target_role_audit`: SalesTargetRole enum, Employee.salesTargetRole, EmployeeMonthlyTarget.roleAtGeneration/weightAtGeneration, SalesTargetAudit table).
2. Optional backfill: `Employee.salesTargetRole` is nullable; existing employees use role derived from `Employee.position`. To set explicit roles (e.g. High Jewellery Expert), update via admin or SQL.
3. No breaking changes to Schedule/Tasks/Zones.
