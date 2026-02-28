/**
 * Types for dashboard analytics (sales, etc.).
 */

export type SalesAnalytics = {
  target: number;
  actual: number;
  completionPct: number;
  gap: number;
  dailyActuals: Array<{ date: string; amount: number }>;
  byRole: Array<{ role: string; actual: number; pct: number }>;
  top5: Array<{ name: string; actual: number }>;
  bottom5: Array<{ name: string; actual: number }>;
  volatilityIndex: number | null;
  momComparison: string | null;
  wowComparison: string | null;
};
