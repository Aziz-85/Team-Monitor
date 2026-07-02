/** Hard caps and thresholds for Schedule Engine v3 constraint solver. */

export const MAX_SCENARIOS = 8;
export const MAX_ITERATIONS_PER_DAY = 300;
export const MAX_TOTAL_ITERATIONS = 5000;
export const MAX_SOLVE_MS = 2500;

/** Fairness score (lower is better) considered acceptable when coverage is valid. */
export const FAIRNESS_ACCEPTABLE_THRESHOLD = 200;

export type SolverStatus =
  | 'COMPLETE'
  | 'PARTIAL_TIMEOUT'
  | 'PARTIAL_ITERATION_LIMIT'
  | 'IMPOSSIBLE';

export type StoppedReason =
  | 'COVERAGE_COMPLETE'
  | 'FAIRNESS_ACCEPTABLE'
  | 'MAX_SCENARIOS'
  | 'MAX_ITERATIONS'
  | 'MAX_ITERATIONS_PER_DAY'
  | 'SOLVE_TIMEOUT'
  | 'IMPOSSIBLE_STAFFING'
  | 'NO_PROGRESS'
  | 'VARIANTS_EXHAUSTED';
