# I18N + RTL + NAV Consistency Audit Report — Team Monitor

**Date:** 2025-02-26  
**Goal:** Arabic mode fully translated + RTL-safe across target pages; no raw i18n keys; single `useT()` pattern; nav keys complete.

---

## 1) Files changed

| File | Change |
|------|--------|
| **messages/en.json** | Added `nav.admin.importIssues`; added `executive.monthly.*`, `sales.summary.*`, `sales.returns.*`, `admin.administration.*`, `leadershipImpact.*`. |
| **messages/ar.json** | Added `nav.group.PERFORMANCE`, `nav.group.HR_AND_TEAM`, `nav.group.SYSTEM`; `nav.admin.importIssues`; same new sections as en with Arabic values. |
| **lib/navConfig.ts** | `Role` import switched from `@prisma/client` to `@/lib/permissions`. |
| **app/(dashboard)/executive/monthly/MonthlyBoardClient.tsx** | Migrated to `useT()`; all UI strings use `t('executive.monthly.*')`; RTL: `rounded-l/r` → `rounded-s/e`, `border-l/r` → `border-s/e`. |
| **app/(dashboard)/sales/summary/SalesSummaryClient.tsx** | Migrated to `useT()`; headings, buttons, table headers, labels use `t('sales.summary.*')`; `pr-2` → `pe-2` where applicable. |
| **app/(dashboard)/sales/returns/SalesReturnsClient.tsx** | Migrated to `useT()`; all labels, buttons, table headers, errors use `t('sales.returns.*')`. |
| **app/(dashboard)/admin/administration/AdminAdministrationClient.tsx** | Migrated to `useT()`; dashboard title and card title/description keys from `admin.administration.*`. |
| **app/(dashboard)/sales/leadership-impact/LeadershipImpactClient.tsx** | **NEW** — Client component with `useT()` for all Leadership Impact UI (title, filters, KPIs, table, flags, summary). |
| **app/(dashboard)/sales/leadership-impact/page.tsx** | Server page now renders `LeadershipImpactClient` with server-computed dto; removed inline English UI; `Role` from `@/lib/permissions`. |

---

## 2) Keys added/updated in en.json + ar.json

**Nav (fix raw keys in Arabic):**
- **ar.json** `nav.group`: `PERFORMANCE` (أداء), `HR_AND_TEAM` (الموارد البشرية والفرق), `SYSTEM` (النظام).
- **en.json** / **ar.json** `nav.admin`: `importIssues` (Import — Issues / مشكلات الاستيراد).

**New sections (en + ar):**
- **executive.monthly**: title, prev, next, thisMonth, previousMonth, nextMonth, monthPickerLabel, dataScope, boutiqueLabel, monthLabel, salesEntries, ledgerLines, loading, failedToLoad, boutiquePerformanceScore, salesIntelligence, workforceStability, operationalDiscipline, riskScore, and component labels (salesSar, target, achievement, employeeTargets, pendingLeaves, approvedLeavesInPeriod, employeesWithTarget, taskCompletions, scheduleEdits, zoneRuns, zoneCompliance, sales, tasks, schedule, zone, discipline).
- **sales.summary**: title, apply, loading, loadingTargets, boutiqueIdPlaceholder, boutiqueTargets, week, month, quarter, halfYear, year, target, achieved, remaining, progress, netSales, grossSales, returns, guestCoverageNet, employee, net, guestCoverage, sourceBoutique, sourcesNote, failedToLoad.
- **sales.returns**: title, addReturnOrExchange, type, date, employee, amountSar, referenceOptional, originalTxnIdOptional, return, exchange, selectPlaceholder, adding, add, apply, loading, dateCol, employeeCol, typeCol, referenceCol, netSarCol, originalTxnCol, linked, noReturnsInPeriod, pleaseFillDateEmployeeAmount, failedToLoad, failedToAdd.
- **admin.administration**: dashboardTitle, usersAndRoles, usersAndRolesDesc, permissionsAccess, permissionsAccessDesc, calendar, calendarDesc, auditLogs, auditLogsDesc, systemSettings, systemSettingsDesc, versionBuild, versionBuildDesc.
- **leadershipImpact**: title, allSources, ledgerOnly, total, top1Share, top2Share, balanceScore, concentration, teamDistribution, rank, seller, amountSar, share, noSalesDataForMonth, coachingFlags, noCoachingFlags, summary, concentrationHigh, concentrationMed, concentrationLow.

---

## 3) Before/after notes for each target page

| Page | Before | After |
|------|--------|--------|
| **MonthlyBoardClient** | Hardcoded "Monthly Board Report", "Prev", "Next", "This month", "Data scope", card titles, loading/error. | All via `t('executive.monthly.*')`. Month nav uses logical classes (`rounded-s/e`, `border-s/e`). |
| **SalesSummaryClient** | Hardcoded "Sales Summary", "Apply", "Boutique Targets", Week/Month/Quarter/Half-Year/Year, "Progress", table headers, "Sources: LEDGER + IMPORT + MANUAL". | All via `t('sales.summary.*')`. Table headers use `pe-2` / `text-start` / `text-end`. |
| **SalesReturnsClient** | Hardcoded "Returns / Exchanges", "Add return or exchange", form labels, table headers, "Linked", "No returns/exchanges...", errors. | All via `t('sales.returns.*')`. |
| **Leadership Impact** | Server-rendered English: "Leadership Impact", "All sources", "LEDGER only", KPI labels, table headers, "No sales data...", "Coaching flags", "Summary". | Client component `LeadershipImpactClient` with `useT()` for all strings; server page only fetches data and passes dto. |
| **AdminAdministrationClient** | Hardcoded "Administration Dashboard" and six card titles/descriptions. | All via `t('admin.administration.dashboardTitle')` and `t(card.titleKey)` / `t(card.descKey)`. |

---

## 4) Remaining hardcoded English and why

- **Sales import / monthly matrix / import issues:** Not patched in this audit; same pattern can be applied (add keys under `salesDaily.matrixImport` or existing import keys and migrate clients to `useT()`).
- **Schedule / calendar day headers:** Calendar localization (e.g. `ar-SA` day names, week start Saturday) was scoped as Step 4 and deferred; day headers in schedule views still use existing `days.*` or raw formatting where not yet wired to locale.
- **Other RTL:** Directional classes (e.g. `pl-4`/`pr-4` in AdminCoverageClient, schedule excel views) were not fully normalized in this pass; `.rtl-flip` and `dirIcon` are in place for future use.
- **typecheck:** Still fails only in `__tests__/sales-summary-targets.test.ts` (imports non-exported route helpers); unrelated to i18n.

---

## 5) Validation

| Check | Result |
|-------|--------|
| **npm run typecheck** | Fails only in `__tests__/sales-summary-targets.test.ts` (pre-existing). |
| **npm run build** | **Passes.** |

**Manual checklist (recommended):**
1. Switch locale to Arabic: confirm no raw keys (e.g. `nav.group.SYSTEM`) in sidebar/nav.
2. Executive Monthly, Sales Summary, Sales Returns, Leadership Impact, Administration Dashboard: no English in Arabic mode (except app name if kept).
3. RTL: spacing and alignment correct on migrated pages; Prev/Next month use logical (start/end) styling.

---

## 6) Summary

- **Nav:** `nav.group.PERFORMANCE`, `HR_AND_TEAM`, `SYSTEM` and `nav.admin.importIssues` added so sidebar never shows raw keys in Arabic.
- **Target pages:** MonthlyBoardClient, SalesSummaryClient, SalesReturnsClient, AdminAdministrationClient, and Leadership Impact (new client component) use `useT()` and message keys only.
- **Single pattern:** All these clients use `useT()` from `@/lib/i18n/useT`; nav continues to use `t(group.labelKey)` and `t(item.key)`.
- **RTL:** Logical classes applied on Monthly Board (rounded-s/e, border-s/e) and Sales Summary (pe-2); broader RTL and calendar localization left for a follow-up.
