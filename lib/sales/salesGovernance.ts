/**
 * Sales governance registry — approved surfaces and parity contracts (documentation + dev hints).
 * Does **not** enforce at runtime in production; use tests + admin diagnostics to catch drift.
 */

export type ApprovedSalesSurface = {
  id: string;
  pathPattern: string;
  readHelper: string;
  /** Names aligned with `parityContracts.ts` / `parityEngine` contract names. */
  parityContracts: string[];
  notes?: string;
};

/** Registered business-facing sales read surfaces (extend when adding routes). */
export const APPROVED_SALES_READ_SURFACES: ApprovedSalesSurface[] = [
  {
    id: 'api-dashboard',
    pathPattern: 'app/api/dashboard/route.ts',
    readHelper: 'getPerformanceSummaryExtended → readSalesAggregate',
    parityContracts: ['BoutiqueMonth_AggregateEqualsDashboardActual'],
  },
  {
    id: 'api-sales-summary',
    pathPattern: 'app/api/sales/summary/route.ts',
    readHelper: 'aggregateSalesEntrySum, salesEntryWhereDateRangeInclusive',
    parityContracts: ['BoutiqueMonth_AggregateEqualsGroupBySum'],
  },
  {
    id: 'api-sales-monthly-matrix',
    pathPattern: 'app/api/sales/monthly-matrix/route.ts',
    readHelper: 'salesEntryWhereForBoutiqueMonths',
    parityContracts: ['MatrixScopeGrandTotal_EqualsAggregate'],
  },
  {
    id: 'api-me-sales-get',
    pathPattern: 'app/api/me/sales/route.ts',
    readHelper: 'salesEntryWhereForUserMonth',
    parityContracts: ['EmployeeMtd_EqualsGetTargetMetrics'],
  },
  {
    id: 'api-metrics-dashboard',
    pathPattern: 'app/api/metrics/dashboard/route.ts',
    readHelper: 'getDashboardSalesMetrics → groupSalesByUserForBoutiqueMonth',
    parityContracts: ['BoutiqueMonth_AggregateEqualsDashboardActual'],
  },
  {
    id: 'api-metrics-my-target',
    pathPattern: 'app/api/metrics/my-target/route.ts',
    readHelper: 'getTargetMetrics → aggregateSalesEntrySum',
    parityContracts: ['EmployeeMtd_EqualsGetTargetMetrics'],
  },
  {
    id: 'api-executive-main',
    pathPattern: 'app/api/executive/route.ts',
    readHelper: 'aggregateSalesEntrySumForBoutiquesMonth, groupSalesSumByMonthForScopedBoutiques',
    parityContracts: ['BoutiqueMonth_AggregateEqualsGroupBySum'],
    notes: 'Executive KPIs; aligned with canonical helpers (P3).',
  },
  {
    id: 'api-executive-compare',
    pathPattern: 'app/api/executive/compare/route.ts',
    readHelper: 'groupSalesSumByBoutiqueForMonth',
    parityContracts: ['BoutiqueMonth_AggregateEqualsGroupBySum'],
  },
  {
    id: 'api-executive-monthly',
    pathPattern: 'app/api/executive/monthly/route.ts',
    readHelper:
      'ledger aggregate + BoutiqueSalesLine groupBy + groupSalesEntryBySource + calculateBoutiqueScore (ledger revenue)',
    parityContracts: [],
    notes:
      'Mixed ledger + SalesEntry; KPI revenue uses ledger/manual rules. Not aligned to pure SalesEntry parity suite. Policy: docs/historical-ledger-reconciliation.md',
  },
];

/** Dev-only: log when a new file might bypass canonical reads (call from tests or local scripts). */
export function devWarnSalesGovernance(message: string, context?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (process.env.SALES_GOVERNANCE_SILENT === '1') return;
  console.warn(`[sales-governance] ${message}`, context ?? '');
}

/** Dev-only: warn if `surfaceId` is not in `APPROVED_SALES_READ_SURFACES` (optional hook for new routes). */
export function assertDevApprovedSalesSurface(surfaceId: string): void {
  const ok = APPROVED_SALES_READ_SURFACES.some((s) => s.id === surfaceId);
  if (!ok) {
    devWarnSalesGovernance(`Unregistered sales surface id "${surfaceId}" — add to APPROVED_SALES_READ_SURFACES and parity tests.`);
  }
}
