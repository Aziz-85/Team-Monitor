/**
 * Scenario scoring for the Workforce AI Scenario Simulator.
 *
 * Each simulated workforce strategy is scored 0–100 so the manager can compare
 * options at a glance. Scoring is a pure function of the scenario's outcome
 * metrics — it never runs the solver or touches the database.
 *
 * Weights:
 *   Coverage    40%   — did we actually staff the week?
 *   Fairness    20%   — is the load balanced across employees?
 *   Fatigue     15%   — how much overtime / bridge strain did we add?
 *   Cost        15%   — external support (high), overtime (medium), off-move (low)
 *   Simplicity  10%   — fewer moving parts is easier to run
 */

export type ScenarioScoreBreakdown = {
  total: number;
  coverage: number;
  fairness: number;
  fatigue: number;
  cost: number;
  simplicity: number;
};

export type ScenarioScoreInput = {
  coverageValid: boolean;
  slotViolations: number;
  missingHours: number;
  overtimeHours: number;
  bridgeCount: number;
  externalSupportHours: number;
  weeklyOffMoves: number;
  /** 0–100 fairness health from Schedule Quality. */
  fairnessHealth: number;
  /** Number of distinct manager-facing actions this scenario requires. */
  actionCount: number;
  /** Highest number of bridge/split shifts landed on a single employee. */
  maxBridgesPerEmployee?: number;
  /** Hybrid scenarios carry more moving parts — small extra simplicity penalty. */
  isHybrid?: boolean;
};

export const SCENARIO_SCORE_WEIGHTS = {
  coverage: 0.4,
  fairness: 0.2,
  fatigue: 0.15,
  cost: 0.15,
  simplicity: 0.1,
} as const;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function coverageScore(input: ScenarioScoreInput): number {
  if (input.coverageValid) return 100;
  // Each unmet 30-min slot and each missing staff-hour chips away from full coverage.
  return clamp(100 - input.slotViolations * 3 - input.missingHours * 1.5);
}

function fairnessScore(input: ScenarioScoreInput): number {
  return clamp(input.fairnessHealth);
}

function fatigueScore(input: ScenarioScoreInput): number {
  const concentration = Math.max(0, (input.maxBridgesPerEmployee ?? 0) - 1) * 8;
  return clamp(100 - input.overtimeHours * 3 - input.bridgeCount * 5 - concentration);
}

function costScore(input: ScenarioScoreInput): number {
  // External support is the most expensive lever; overtime medium; off-move cheapest.
  return clamp(
    100 - input.externalSupportHours * 4 - input.overtimeHours * 2 - input.weeklyOffMoves * 3
  );
}

function simplicityScore(input: ScenarioScoreInput): number {
  const base = 100 - Math.max(0, input.actionCount - 1) * 15;
  return clamp(base - (input.isHybrid ? 8 : 0));
}

/** Score a single scenario 0–100 with a per-dimension breakdown. */
export function scoreScenario(input: ScenarioScoreInput): ScenarioScoreBreakdown {
  const coverage = coverageScore(input);
  const fairness = fairnessScore(input);
  const fatigue = fatigueScore(input);
  const cost = costScore(input);
  const simplicity = simplicityScore(input);

  const total = clamp(
    coverage * SCENARIO_SCORE_WEIGHTS.coverage +
      fairness * SCENARIO_SCORE_WEIGHTS.fairness +
      fatigue * SCENARIO_SCORE_WEIGHTS.fatigue +
      cost * SCENARIO_SCORE_WEIGHTS.cost +
      simplicity * SCENARIO_SCORE_WEIGHTS.simplicity
  );

  return {
    total: Math.round(total),
    coverage: Math.round(coverage),
    fairness: Math.round(fairness),
    fatigue: Math.round(fatigue),
    cost: Math.round(cost),
    simplicity: Math.round(simplicity),
  };
}

/**
 * Rank scenarios by total score (desc). Ties break toward the simpler, lower-cost,
 * more coverage-valid option so the "best" is also the most operationally sane.
 */
export function rankScenarioScores<T extends { scoreBreakdown: ScenarioScoreBreakdown; simulationResult: { coverageValid: boolean } }>(
  scenarios: T[]
): T[] {
  return [...scenarios].sort((a, b) => {
    if (b.scoreBreakdown.total !== a.scoreBreakdown.total) {
      return b.scoreBreakdown.total - a.scoreBreakdown.total;
    }
    if (a.simulationResult.coverageValid !== b.simulationResult.coverageValid) {
      return a.simulationResult.coverageValid ? -1 : 1;
    }
    if (b.scoreBreakdown.cost !== a.scoreBreakdown.cost) {
      return b.scoreBreakdown.cost - a.scoreBreakdown.cost;
    }
    return b.scoreBreakdown.simplicity - a.scoreBreakdown.simplicity;
  });
}
