/**
 * Executive metrics — pure functions for risk, anomalies, and week ranges.
 * Timezone: Asia/Riyadh. Week start: Saturday.
 * All logic is explainable (reasons list for risk and anomalies).
 */

/** Saturday-start week range. weekStart and weekEnd are YYYY-MM-DD (Sat and Fri). */
export type WeekRange = {
  weekStart: string;
  weekEnd: string;
  dateStrings: string[];
};

/** Get the Saturday-start week containing the given date. Uses UTC for consistency with DB. */
export function getWeekRange(date: Date): WeekRange {
  const str = date.toISOString().slice(0, 10);
  const d = new Date(str + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = (day - 6 + 7) % 7;
  const sat = new Date(d);
  sat.setUTCDate(sat.getUTCDate() - diff);
  const dateStrings: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(sat);
    x.setUTCDate(sat.getUTCDate() + i);
    dateStrings.push(x.toISOString().slice(0, 10));
  }
  return {
    weekStart: dateStrings[0],
    weekEnd: dateStrings[6],
    dateStrings,
  };
}

/** Last N weeks (each Saturday–Friday). Most recent first. refDate defaults to now. */
export function getLastNWeeksRanges(n: number, refDate?: Date): WeekRange[] {
  const ref = refDate ?? new Date();
  const first = getWeekRange(ref);
  const out: WeekRange[] = [first];
  const sat = new Date(first.weekStart + 'T00:00:00Z');
  for (let i = 1; i < n; i++) {
    sat.setUTCDate(sat.getUTCDate() - 7);
    const weekStart = sat.toISOString().slice(0, 10);
    const dateStrings: string[] = [];
    for (let j = 0; j < 7; j++) {
      const x = new Date(sat);
      x.setUTCDate(sat.getUTCDate() + j);
      dateStrings.push(x.toISOString().slice(0, 10));
    }
    out.push({
      weekStart,
      weekEnd: dateStrings[6],
      dateStrings,
    });
  }
  return out;
}

/** Revenue metrics from raw totals (pure). */
export function computeRevenueMetrics(params: {
  revenue: number;
  target: number;
}): { revenue: number; target: number; achievementPct: number } {
  const { revenue, target } = params;
  const achievementPct = target > 0 ? Math.round((revenue / target) * 100) : 0;
  return { revenue, target, achievementPct };
}

/** Task metrics from counts (pure). */
export function computeTaskMetrics(params: {
  completed: number;
  total: number;
  overdue: number;
}): {
  completed: number;
  total: number;
  overdue: number;
  overduePct: number;
  completionPct: number;
} {
  const { completed, total, overdue } = params;
  const overduePct = total > 0 ? Math.round((overdue / total) * 100) : 0;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, overdue, overduePct, completionPct };
}

/** Zone compliance from counts (pure). */
export function computeZoneCompliance(params: {
  completed: number;
  total: number;
}): { completed: number; total: number; compliancePct: number } {
  const { completed, total } = params;
  const compliancePct = total > 0 ? Math.round((completed / total) * 100) : 100;
  return { completed, total, compliancePct };
}

/** Schedule balance from AM/PM counts (pure). */
export function computeScheduleBalance(params: {
  amCount: number;
  pmCount: number;
  violationCount?: number;
}): {
  amCount: number;
  pmCount: number;
  balancePct: number;
  staffingRisk: boolean;
  violationCount: number;
} {
  const { amCount, pmCount, violationCount = 0 } = params;
  const balancePct =
    Math.max(amCount, pmCount) > 0
      ? Math.round((Math.min(amCount, pmCount) / Math.max(amCount, pmCount)) * 100)
      : 100;
  const staffingRisk = amCount < 2 || balancePct < 50;
  return {
    amCount,
    pmCount,
    balancePct,
    staffingRisk,
    violationCount,
  };
}

export type RiskLevel = 'LOW' | 'MED' | 'HIGH';

export type RiskIndexResult = {
  score: number;
  level: RiskLevel;
  reasons: string[];
};

export type AggregatedMetrics = {
  achievementPct: number;
  overduePct: number;
  suspiciousPct?: number;
  scheduleBalancePct?: number;
  zoneCompliancePct?: number;
  weekStart?: string;
};

/**
 * Compute risk index 0–100 and level with explainable reasons.
 * Higher score = higher risk. Reasons list explains why.
 */
export function computeRiskIndex(metrics: AggregatedMetrics): RiskIndexResult {
  const reasons: string[] = [];
  let score = 0;

  const ach = metrics.achievementPct ?? 0;
  if (ach < 80) {
    score += Math.min(30, (80 - ach) * 0.5);
    reasons.push(`executive.risk.reasonAchievement`);
  } else if (ach < 90) {
    score += 5;
    reasons.push(`executive.risk.reasonAchievementBelow90`);
  }

  const overdue = metrics.overduePct ?? 0;
  if (overdue > 10) {
    score += Math.min(25, overdue * 0.8);
    reasons.push(`executive.risk.reasonOverdue`);
  } else if (overdue > 5) {
    score += 5;
    reasons.push(`executive.risk.reasonOverdueElevated`);
  }

  const suspicious = metrics.suspiciousPct ?? 0;
  if (suspicious > 5) {
    score += Math.min(25, suspicious * 2);
    reasons.push(`executive.risk.reasonSuspicious`);
  } else if (suspicious > 2) {
    score += 5;
    reasons.push(`executive.risk.reasonSuspiciousElevated`);
  }

  const balance = metrics.scheduleBalancePct ?? 100;
  if (balance < 50) {
    score += 15;
    reasons.push(`executive.risk.reasonScheduleBalance`);
  } else if (balance < 70) {
    score += 5;
    reasons.push(`executive.risk.reasonScheduleBalanceLow`);
  }

  const zone = metrics.zoneCompliancePct ?? 100;
  if (zone < 80) {
    score += Math.min(15, (100 - zone) * 0.2);
    reasons.push(`executive.risk.reasonZoneCompliance`);
  }

  const clamped = Math.min(100, Math.round(score));
  let level: RiskLevel = 'LOW';
  if (clamped >= 50) level = 'HIGH';
  else if (clamped >= 25) level = 'MED';

  return {
    score: clamped,
    level,
    reasons: reasons.length > 0 ? reasons : ['executive.risk.reasonNone'],
  };
}

/** Data point for trend series (e.g. one week). */
export type TrendDataPoint = {
  weekStart: string;
  revenue?: number;
  target?: number;
  achievementPct?: number;
  overduePct?: number;
  zoneCompliancePct?: number;
};

/** Anomaly types (non-anti-gaming). */
export type AnomalyKind =
  | 'employee_performance_swing'
  | 'day_revenue_spike'
  | 'day_revenue_dip'
  | 'day_tasks_dip'
  | 'zone_compliance_dip';

export type Anomaly = {
  kind: AnomalyKind;
  severity: 'low' | 'medium' | 'high';
  titleKey: string;
  evidenceKey: string;
  evidence: Record<string, string | number>;
  deepLink?: string;
  weekStart?: string;
};

/**
 * Detect anomalies from trend series and optional detail.
 * Returns structured anomalies with reasons (evidence).
 */
export function detectAnomalies(params: {
  trendSeries: TrendDataPoint[];
  employeeSwing?: { empId: string; name: string; pctChange: number; weekStart: string };
  dayOutliers?: { date: string; revenueDelta?: number; tasksDelta?: number }[];
  zoneDips?: { zoneCode: string; compliancePct: number; weekStart: string }[];
}): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const { trendSeries, employeeSwing, dayOutliers, zoneDips } = params;

  if (employeeSwing && Math.abs(employeeSwing.pctChange) >= 30) {
    anomalies.push({
      kind: 'employee_performance_swing',
      severity: Math.abs(employeeSwing.pctChange) >= 50 ? 'high' : 'medium',
      titleKey: 'executive.anomaly.employeeSwingTitle',
      evidenceKey: 'executive.anomaly.employeeSwingEvidence',
      evidence: {
        name: employeeSwing.name,
        pctChange: employeeSwing.pctChange,
        weekStart: employeeSwing.weekStart,
      },
      deepLink: '/tasks/monitor',
      weekStart: employeeSwing.weekStart,
    });
  }

  dayOutliers?.forEach((d) => {
    if (d.revenueDelta != null && d.revenueDelta < -20) {
      anomalies.push({
        kind: 'day_revenue_dip',
        severity: d.revenueDelta < -40 ? 'high' : 'medium',
        titleKey: 'executive.anomaly.dayRevenueDipTitle',
        evidenceKey: 'executive.anomaly.dayRevenueDipEvidence',
        evidence: { date: d.date, pct: d.revenueDelta },
        deepLink: '/dashboard',
      });
    }
    if (d.revenueDelta != null && d.revenueDelta > 40) {
      anomalies.push({
        kind: 'day_revenue_spike',
        severity: 'low',
        titleKey: 'executive.anomaly.dayRevenueSpikeTitle',
        evidenceKey: 'executive.anomaly.dayRevenueSpikeEvidence',
        evidence: { date: d.date, pct: d.revenueDelta },
      });
    }
    if (d.tasksDelta != null && d.tasksDelta < -25) {
      anomalies.push({
        kind: 'day_tasks_dip',
        severity: d.tasksDelta < -50 ? 'high' : 'medium',
        titleKey: 'executive.anomaly.dayTasksDipTitle',
        evidenceKey: 'executive.anomaly.dayTasksDipEvidence',
        evidence: { date: d.date, pct: d.tasksDelta },
        deepLink: '/tasks/monitor',
      });
    }
  });

  zoneDips?.forEach((z) => {
    if (z.compliancePct < 80) {
      anomalies.push({
        kind: 'zone_compliance_dip',
        severity: z.compliancePct < 60 ? 'high' : 'medium',
        titleKey: 'executive.anomaly.zoneDipTitle',
        evidenceKey: 'executive.anomaly.zoneDipEvidence',
        evidence: { zone: z.zoneCode, pct: z.compliancePct, weekStart: z.weekStart },
        deepLink: '/inventory/zones',
        weekStart: z.weekStart,
      });
    }
  });

  if (trendSeries.length >= 2) {
    const last = trendSeries[0];
    const prev = trendSeries[1];
    if (
      last.achievementPct != null &&
      prev.achievementPct != null &&
      last.achievementPct - prev.achievementPct < -15
    ) {
      anomalies.push({
        kind: 'day_revenue_dip',
        severity: 'medium',
        titleKey: 'executive.anomaly.achievementDropTitle',
        evidenceKey: 'executive.anomaly.achievementDropEvidence',
        evidence: {
          from: prev.achievementPct,
          to: last.achievementPct,
          weekStart: last.weekStart,
        },
        weekStart: last.weekStart,
      });
    }
    if (
      last.zoneCompliancePct != null &&
      prev.zoneCompliancePct != null &&
      last.zoneCompliancePct - prev.zoneCompliancePct < -20
    ) {
      anomalies.push({
        kind: 'zone_compliance_dip',
        severity: 'medium',
        titleKey: 'executive.anomaly.zoneTrendDipTitle',
        evidenceKey: 'executive.anomaly.zoneTrendDipEvidence',
        evidence: {
          from: prev.zoneCompliancePct,
          to: last.zoneCompliancePct,
          weekStart: last.weekStart,
        },
        deepLink: '/inventory/zones',
        weekStart: last.weekStart,
      });
    }
  }

  return anomalies;
}

// --- Sales-centric risk and momentum (v1.2.0) ---

export type SalesRiskLevel =
  | 'Dominant'
  | 'Strong'
  | 'Watch'
  | 'At Risk'
  | 'Critical';

export type SalesRiskMetrics = {
  /** Revenue achievement % (0-100). */
  achievementPct: number;
  /** Revenue trend: 'uptrend' | 'flat' | 'downtrend'. */
  revenueTrendDirection: 'uptrend' | 'flat' | 'downtrend';
  /** Target gap momentum: improving = gap shrinking, worsening = gap growing. */
  targetGapMomentum: 'improving' | 'stable' | 'worsening';
  /** Task completion % (0-100). */
  taskCompletionPct: number;
  /** Zone compliance % (0-100). */
  zoneCompliancePct: number;
  /** Discipline score 0-100 (e.g. 100 - suspiciousPct). */
  disciplineScore: number;
};

export type SalesRiskIndexResult = {
  score: number;
  level: SalesRiskLevel;
  reasons: string[];
};

/**
 * Revenue trend from last 3 weeks (index 0 = most recent).
 * Explainable: compare most recent vs oldest; threshold 5% for flat.
 */
export function getRevenueTrendDirection(last3WeeksRevenue: number[]): 'uptrend' | 'flat' | 'downtrend' {
  if (last3WeeksRevenue.length < 2) return 'flat';
  const recent = last3WeeksRevenue[0];
  const older = last3WeeksRevenue[last3WeeksRevenue.length - 1];
  if (older === 0) return recent > 0 ? 'uptrend' : 'flat';
  const pctChange = ((recent - older) / older) * 100;
  if (pctChange >= 5) return 'uptrend';
  if (pctChange <= -5) return 'downtrend';
  return 'flat';
}

/**
 * Target gap momentum: gap = target - revenue. Improving = gap shrinking.
 */
export function getTargetGapMomentum(
  gapThisWeek: number,
  gapPrevWeek: number
): 'improving' | 'stable' | 'worsening' {
  const diff = gapPrevWeek - gapThisWeek;
  if (diff > 0) return 'improving';
  if (diff < 0) return 'worsening';
  return 'stable';
}

/**
 * Simple linear regression on weekly revenue series (index 0 = most recent).
 * Projects next N weeks. Returns array of { weekOffset: 1..N, projectedRevenue }.
 */
export function linearRegressionProjection(
  weeklyRevenue: number[],
  nextN: number
): { weekOffset: number; projectedRevenue: number }[] {
  if (weeklyRevenue.length < 2 || nextN < 1) return [];
  const n = weeklyRevenue.length;
  const x = Array.from({ length: n }, (_, i) => n - 1 - i);
  const y = [...weeklyRevenue].reverse();
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
  const meanX = sumX / n;
  const meanY = sumY / n;
  const intercept = meanY - slope * meanX;
  const out: { weekOffset: number; projectedRevenue: number }[] = [];
  for (let k = 1; k <= nextN; k++) {
    const proj = intercept + slope * (n - 1 + k);
    out.push({ weekOffset: k, projectedRevenue: Math.round(Math.max(0, proj)) });
  }
  return out;
}

/**
 * Volatility index: (std dev of daily amounts / mean) * 100. 0 if mean is 0.
 */
export function volatilityIndex(dailyAmounts: number[]): number {
  if (dailyAmounts.length === 0) return 0;
  const mean = dailyAmounts.reduce((a, b) => a + b, 0) / dailyAmounts.length;
  if (mean === 0) return 0;
  const variance =
    dailyAmounts.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyAmounts.length;
  const std = Math.sqrt(variance);
  return Math.round((std / mean) * 100);
}

/**
 * Sales-weighted risk index. Score 0-100 (higher = worse). Level: Dominant (best) to Critical (worst).
 * Weights: Revenue Achievement 55%, Revenue Trend 15%, Target Gap 10%, Task 10%, Zone 5%, Discipline 5%.
 * All reasons are i18n keys.
 */
export function computeSalesRiskIndex(metrics: SalesRiskMetrics): SalesRiskIndexResult {
  const reasons: string[] = [];
  let score = 0;

  const ach = metrics.achievementPct ?? 0;
  const achContribution = ach >= 100 ? 0 : ach >= 90 ? 5 : ach >= 80 ? 15 : ach >= 70 ? 25 : Math.min(55, (100 - ach) * 0.8);
  score += achContribution;
  if (ach < 70) reasons.push('executive.salesRisk.reasonAchievementLow');
  else if (ach < 80) reasons.push('executive.salesRisk.reasonAchievementBelow80');
  else if (ach < 90) reasons.push('executive.salesRisk.reasonAchievementBelow90');
  else if (ach < 100) reasons.push('executive.salesRisk.reasonAchievementBelow100');
  else reasons.push('executive.salesRisk.reasonAchievementOnTarget');

  const trend = metrics.revenueTrendDirection ?? 'flat';
  if (trend === 'downtrend') {
    score += 15;
    reasons.push('executive.salesRisk.reasonTrendDowntrend');
  } else if (trend === 'flat') {
    score += 5;
    reasons.push('executive.salesRisk.reasonTrendFlat');
  } else {
    reasons.push('executive.salesRisk.reasonTrendUptrend');
  }

  const gapM = metrics.targetGapMomentum ?? 'stable';
  if (gapM === 'worsening') {
    score += 10;
    reasons.push('executive.salesRisk.reasonGapWorsening');
  } else if (gapM === 'stable') {
    score += 3;
    reasons.push('executive.salesRisk.reasonGapStable');
  } else {
    reasons.push('executive.salesRisk.reasonGapImproving');
  }

  const task = metrics.taskCompletionPct ?? 100;
  const taskContribution = task >= 90 ? 0 : task >= 70 ? 3 : Math.min(10, (100 - task) * 0.15);
  score += taskContribution;
  if (task < 70) reasons.push('executive.salesRisk.reasonTaskLow');
  else if (task < 90) reasons.push('executive.salesRisk.reasonTaskBelow90');

  const zone = metrics.zoneCompliancePct ?? 100;
  const zoneContribution = zone >= 90 ? 0 : zone >= 80 ? 2 : Math.min(5, (100 - zone) * 0.1);
  score += zoneContribution;
  if (zone < 80) reasons.push('executive.salesRisk.reasonZoneLow');
  else if (zone < 90) reasons.push('executive.salesRisk.reasonZoneBelow90');

  const disc = metrics.disciplineScore ?? 100;
  const discContribution = disc >= 90 ? 0 : disc >= 70 ? 2 : Math.min(5, (100 - disc) * 0.1);
  score += discContribution;
  if (disc < 70) reasons.push('executive.salesRisk.reasonDisciplineLow');
  else if (disc < 90) reasons.push('executive.salesRisk.reasonDisciplineBelow90');

  const clamped = Math.min(100, Math.round(score));
  let level: SalesRiskLevel = 'Dominant';
  if (clamped >= 60) level = 'Critical';
  else if (clamped >= 45) level = 'At Risk';
  else if (clamped >= 30) level = 'Watch';
  else if (clamped >= 15) level = 'Strong';

  return {
    score: clamped,
    level,
    reasons: reasons.length > 0 ? reasons : ['executive.salesRisk.reasonNone'],
  };
}

// --- Employee Revenue Score (ERS) — sales-centric per employee ---

export type ERSLevel = 'Dominant' | 'Strong' | 'Watch' | 'At Risk' | 'Critical';

export type ERSMetrics = {
  achievementPct: number;
  revenueTrendDirection: 'uptrend' | 'flat' | 'downtrend';
  /** Consistency 0-100 (higher = more consistent weekly revenue). */
  consistencyScore: number;
};

export type ERSResult = {
  score: number;
  label: ERSLevel;
  reasons: string[];
};

/**
 * Coefficient of variation (std/mean) from weekly revenues. Returns 0 if mean is 0.
 */
export function weeklyRevenueConsistencyScore(weeklyRevenues: number[]): number {
  if (weeklyRevenues.length === 0) return 100;
  const mean = weeklyRevenues.reduce((a, b) => a + b, 0) / weeklyRevenues.length;
  if (mean === 0) return 100;
  const variance =
    weeklyRevenues.reduce((s, v) => s + (v - mean) ** 2, 0) / weeklyRevenues.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;
  return Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
}

/**
 * ERS: 0-100, higher = better. Weights: Achievement 55%, Trend 15%, Consistency 30%.
 * Labels: Dominant (90+), Strong (75-89), Watch (60-74), At Risk (45-59), Critical (<45).
 */
export function computeEmployeeRevenueScore(metrics: ERSMetrics): ERSResult {
  const reasons: string[] = [];
  const ach = Math.min(100, Math.max(0, metrics.achievementPct ?? 0));
  const trend = metrics.revenueTrendDirection ?? 'flat';
  const consistency = Math.min(100, Math.max(0, metrics.consistencyScore ?? 100));

  const achievementPoints = ach * 0.55;
  const trendPoints = trend === 'uptrend' ? 15 : trend === 'flat' ? 7.5 : 0;
  const consistencyPoints = consistency * 0.3;

  const score = Math.round(achievementPoints + trendPoints + consistencyPoints);
  const clamped = Math.min(100, Math.max(0, score));

  if (ach >= 90) reasons.push('executive.ers.reasonAchievementStrong');
  else if (ach >= 70) reasons.push('executive.ers.reasonAchievementOnTrack');
  else if (ach >= 50) reasons.push('executive.ers.reasonAchievementBelowTarget');
  else reasons.push('executive.ers.reasonAchievementLow');

  if (trend === 'uptrend') reasons.push('executive.ers.reasonTrendUp');
  else if (trend === 'flat') reasons.push('executive.ers.reasonTrendFlat');
  else reasons.push('executive.ers.reasonTrendDown');

  if (consistency >= 70) reasons.push('executive.ers.reasonConsistencyHigh');
  else if (consistency >= 40) reasons.push('executive.ers.reasonConsistencyModerate');
  else reasons.push('executive.ers.reasonConsistencyLow');

  let label: ERSLevel = 'Critical';
  if (clamped >= 90) label = 'Dominant';
  else if (clamped >= 75) label = 'Strong';
  else if (clamped >= 60) label = 'Watch';
  else if (clamped >= 45) label = 'At Risk';

  return {
    score: clamped,
    label,
    reasons,
  };
}
