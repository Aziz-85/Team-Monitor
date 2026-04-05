/**
 * Production sales analytics API payload types (integer SAR, Asia/Riyadh).
 */

export type ComparisonSignal = 'good' | 'warning' | 'risk';

export type SalesAnalyticsComparison = {
  id:
    | 'todayVsYesterday'
    | 'todayVsLastWeek'
    | 'mtdVsLastMonthMtd'
    | 'mtdActualVsTarget'
    | 'mtdActualVsPace';
  current: number;
  reference: number | null;
  delta: number | null;
  deltaPct: number | null;
  signal: ComparisonSignal;
};

export type SalesAnalyticsRankRow = {
  rank: number;
  id: string;
  name: string;
  sales: number;
  target: number;
  achPct: number;
  contributionPct: number;
};

export type SalesAnalyticsTrajectoryPoint = {
  dateKey: string;
  targetCumulative: number;
  actualCumulative: number;
};

export type SalesAnalyticsBarItem = {
  label: string;
  value: number;
  max: number;
};

export type SalesAnalyticsPayload = {
  asOf: string;
  monthKey: string;
  boutiqueId: string;
  boutiqueName: string;
  boutiqueCode: string;
  /** Boutiques included in branch breakdown (area / multi-scope). */
  branchScopeBoutiqueIds: string[];
  kpis: {
    todaySales: number;
    dailyTargetSar: number;
    dailyAchPct: number;
    mtdSales: number;
    mtdTargetSar: number;
    mtdAchPct: number;
    remainingSar: number;
    requiredDailyPaceSar: number;
    forecastEomSar: number;
    expectedMtdLinearSar: number;
    paceDaysPassed: number;
    daysInMonth: number;
  };
  comparisons: SalesAnalyticsComparison[];
  branches: { top: SalesAnalyticsRankRow[]; low: SalesAnalyticsRankRow[] };
  employees: { top: SalesAnalyticsRankRow[]; low: SalesAnalyticsRankRow[] };
  dailyTrajectory: SalesAnalyticsTrajectoryPoint[];
  employeeBars: SalesAnalyticsBarItem[];
  insights: string[];
};
