/**
 * Independent Risk Score — measures operational risk exposure.
 * Unlike Boutique Performance Score (higher = better), Risk Score is inverted:
 *   0 = no risk, 100 = critical.
 *
 * Factors (total 100):
 *   Revenue Gap        (0–30): shortfall below boutique target
 *   Workforce Exposure (0–20): pending + approved leaves relative to workforce
 *   Task Integrity     (0–20): low completion + anti-gaming bursts
 *   Operational Gaps   (0–15): zone compliance shortfall
 *   Schedule Volatility(0–15): excessive schedule edits relative to roster
 */

export type RiskClassification = 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Critical';

export type RiskScoreResult = {
  score: number;
  classification: RiskClassification;
  factors: {
    revenueGap: number;
    workforceExposure: number;
    taskIntegrity: number;
    operationalGaps: number;
    scheduleVolatility: number;
  };
  reasons: string[];
};

export type RiskMetrics = {
  revenue: number;
  target: number;
  achievementPct: number;
  pendingLeaves: number;
  approvedLeaves: number;
  employeeCount: number;
  taskCompletions: number;
  burstCount: number;
  zoneCompliancePct: number;
  scheduleEdits: number;
  rosterSize: number;
};

function classifyRisk(score: number): RiskClassification {
  if (score <= 15) return 'Low';
  if (score <= 35) return 'Moderate';
  if (score <= 55) return 'Elevated';
  if (score <= 75) return 'High';
  return 'Critical';
}

export function calculateRiskScore(m: RiskMetrics): RiskScoreResult {
  const reasons: string[] = [];

  // Revenue Gap (0–30): how far below target
  let revenueGap = 0;
  if (m.target > 0) {
    const shortfallPct = Math.max(0, 100 - m.achievementPct);
    revenueGap = Math.min(30, Math.round((shortfallPct / 100) * 30));
  }
  if (m.achievementPct < 80 && m.target > 0) reasons.push('reasonAchievement');
  else if (m.achievementPct < 90 && m.target > 0) reasons.push('reasonAchievementBelow90');

  // Workforce Exposure (0–20): leave pressure on staffing
  let workforceExposure = 0;
  if (m.employeeCount > 0) {
    const leaveRatio = (m.pendingLeaves + m.approvedLeaves) / m.employeeCount;
    workforceExposure = Math.min(20, Math.round(leaveRatio * 40));
  }
  if (workforceExposure >= 10) reasons.push('reasonHighLeaveExposure');

  // Task Integrity (0–20): completion gaps + anti-gaming bursts
  let taskIntegrity = 0;
  if (m.burstCount > 0) {
    taskIntegrity += Math.min(10, m.burstCount * 4);
    if (m.burstCount >= 2) reasons.push('reasonSuspicious');
    else reasons.push('reasonSuspiciousElevated');
  }
  if (m.taskCompletions === 0 && m.employeeCount > 0) {
    taskIntegrity += 10;
    reasons.push('reasonOverdue');
  }
  taskIntegrity = Math.min(20, taskIntegrity);

  // Operational Gaps (0–15): zone compliance shortfall
  let operationalGaps = 0;
  const zoneGap = Math.max(0, 100 - m.zoneCompliancePct);
  operationalGaps = Math.min(15, Math.round((zoneGap / 100) * 15));
  if (m.zoneCompliancePct < 80) reasons.push('reasonZoneCompliance');

  // Schedule Volatility (0–15): edits relative to roster
  let scheduleVolatility = 0;
  if (m.rosterSize > 0) {
    const editRatio = m.scheduleEdits / m.rosterSize;
    scheduleVolatility = Math.min(15, Math.round(editRatio * 3));
  }
  if (scheduleVolatility >= 8) reasons.push('reasonScheduleBalance');

  const score = Math.min(100, revenueGap + workforceExposure + taskIntegrity + operationalGaps + scheduleVolatility);

  if (reasons.length === 0) reasons.push('reasonNone');

  return {
    score,
    classification: classifyRisk(score),
    factors: { revenueGap, workforceExposure, taskIntegrity, operationalGaps, scheduleVolatility },
    reasons,
  };
}
