/**
 * Central performance engine — single source of truth for target/sales/remaining/percent.
 * Used by: lib/metrics/aggregator, lib/dashboard/managerDashboard, app/api/dashboard.
 * SAR_INT only: all monetary values are integer riyals. No floats, no scaling, no rounding for money.
 * Percent: integer 0–100 from integer division only.
 */

export type PerformanceInput = {
  target: number;
  sales: number;
};

export type PerformanceResult = {
  target: number;
  sales: number;
  remaining: number;
  percent: number;
};

/**
 * Calculate performance metrics from target and sales (both SAR_INT).
 * - remaining: target - sales (integer; negative allowed for overachievement)
 * - percent: actual/target * 100, rounded; can exceed 100 for over-achievement; 0 when target is 0
 */
export function calculatePerformance({ target, sales }: PerformanceInput): PerformanceResult {
  const targetInt = Math.trunc(Number(target)) || 0;
  const salesInt = Math.trunc(Number(sales)) || 0;
  const remaining = targetInt - salesInt;
  const percent =
    targetInt === 0 ? 0 : Math.round((salesInt * 100) / targetInt);
  return {
    target: targetInt,
    sales: salesInt,
    remaining,
    percent,
  };
}

/**
 * Batch calculate for multiple periods. Each input must have target and sales as integers.
 */
export function calculatePerformanceBatch(
  inputs: Record<string, PerformanceInput>
): Record<string, PerformanceResult> {
  const out: Record<string, PerformanceResult> = {};
  for (const [key, input] of Object.entries(inputs)) {
    out[key] = calculatePerformance(input);
  }
  return out;
}
