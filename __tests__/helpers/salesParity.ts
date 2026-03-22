/**
 * Test helpers — re-export parity engine for sales integrity tests.
 */
export {
  evaluateBoutiqueMonthAggregateVsGroupBy,
  evaluateBoutiqueMonthVsDashboardActual,
  evaluateEmployeeMtdVsTargetMetrics,
  evaluateMatrixScopeVsAggregate,
  evaluateBoutiqueMonthColumnVsDateRange,
  runCoreParitySuite,
  type ParityCheckResult,
} from '@/lib/sales/parityEngine';

export { formatParityDiagnostics, runParityDiagnosticsForBoutique } from '@/lib/sales/parityDiagnostics';
