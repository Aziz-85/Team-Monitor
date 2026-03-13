/**
 * Shared performance color logic for KPI cards and progress indicators.
 * Single source of truth for threshold-based coloring (target achievement, sales %, etc.).
 *
 * Thresholds:
 * - Target achievement (default): 100% = success, 60%+ = warning, <60% = danger
 * - Sales breakdown / comparison: 60%+ = success, 40%+ = warning, <40% = danger
 */

export type PerformanceColorVariant = 'success' | 'warning' | 'danger';

export type ProgressBarVariant = 'default' | 'orange' | 'red';

/** Default thresholds for target achievement (e.g. sales vs target). */
const DEFAULT_HIGH = 100;
const DEFAULT_MID = 60;

/** Thresholds for comparison contexts (e.g. employee contribution). */
const COMPARISON_HIGH = 60;
const COMPARISON_MID = 40;

export type PerformanceThresholds = { high?: number; mid?: number };

/**
 * Returns the performance variant (success/warning/danger) for a given percentage.
 * Use for target achievement: getPerformanceColorVariant(pct)
 * Use for comparison: getPerformanceColorVariant(pct, { high: 60, mid: 40 })
 */
export function getPerformanceColorVariant(
  percent: number,
  options?: PerformanceThresholds
): PerformanceColorVariant {
  const high = options?.high ?? DEFAULT_HIGH;
  const mid = options?.mid ?? DEFAULT_MID;
  if (percent >= high) return 'success';
  if (percent >= mid) return 'warning';
  return 'danger';
}

const VARIANT_CLASSES: Record<
  PerformanceColorVariant,
  { ring: string; text: string; bg: string }
> = {
  success: { ring: 'text-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-500' },
  warning: { ring: 'text-amber-500', text: 'text-amber-600', bg: 'bg-amber-500' },
  danger: { ring: 'text-red-500', text: 'text-red-600', bg: 'bg-red-500' },
};

/**
 * Returns Tailwind classes for ring, text, and background.
 * Use in LuxuryPerformanceCard (ring + text) and inline progress bars (bg).
 */
export function getPerformanceColorClasses(
  percent: number,
  options?: PerformanceThresholds
) {
  const v = getPerformanceColorVariant(percent, options);
  return VARIANT_CLASSES[v];
}

export function getPerformanceBgClass(
  percent: number,
  options?: PerformanceThresholds
): string {
  return getPerformanceColorClasses(percent, options).bg;
}

/**
 * Maps percent to ProgressBar component variant.
 * Use for SalesBreakdownSection and other comparison contexts (60/40 thresholds).
 */
export function getProgressBarVariant(
  percent: number,
  options?: PerformanceThresholds
): ProgressBarVariant {
  const high = options?.high ?? COMPARISON_HIGH;
  const mid = options?.mid ?? COMPARISON_MID;
  if (percent >= high) return 'default';
  if (percent >= mid) return 'orange';
  return 'red';
}

/**
 * Text classes for comparison context (e.g. employee contribution).
 * Success uses text-foreground (neutral) instead of emerald.
 */
export function getPerformanceTextClassForComparison(
  percent: number,
  options?: PerformanceThresholds
): string {
  const v = getPerformanceColorVariant(percent, options);
  if (v === 'success') return 'text-foreground';
  return VARIANT_CLASSES[v].text;
}
