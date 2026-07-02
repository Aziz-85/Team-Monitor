/**
 * Management-friendly KPIs derived from constraint analysis (pre-solve).
 */

import type { ConstraintAnalysisResult, ConstraintAnalysisStatus } from '@/lib/schedule/constraintAnalyzer';
import { qualityPercentsFromAnalysis } from '@/lib/schedule/scheduleQuality';

export type HealthLevel = 'good' | 'at_risk' | 'critical';

export type ScheduleHealthKpi = {
  label: string;
  level: HealthLevel;
  detail: string;
  percent: number;
};

export type ScheduleHealthKpis = {
  coverageHealth: ScheduleHealthKpi;
  staffAvailability: ScheduleHealthKpi;
  constraintHealth: ScheduleHealthKpi;
  scheduleQuality: ScheduleHealthKpi;
  fairnessHealth: ScheduleHealthKpi;
};

function levelFromPercent(percent: number): HealthLevel {
  if (percent >= 85) return 'good';
  if (percent >= 60) return 'at_risk';
  return 'critical';
}

function levelFromStatus(status: ConstraintAnalysisStatus): HealthLevel {
  if (status === 'FEASIBLE') return 'good';
  if (status === 'NEEDS_SUPPORT') return 'at_risk';
  return 'critical';
}

/** Map analysis output to management-friendly KPI percentages. */
export function computeScheduleHealthKpis(analysis: ConstraintAnalysisResult): ScheduleHealthKpis {
  const { summary, status, issues, insights } = analysis;
  const percents = qualityPercentsFromAnalysis(analysis);
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const missingSlots = Math.max(0, summary.requiredCoverageSlots - summary.availableCoverageSlots);

  return {
    coverageHealth: {
      label: `${percents.coverageHealthPercent}%`,
      level: levelFromPercent(percents.coverageHealthPercent),
      detail:
        missingSlots > 0
          ? `${missingSlots} slot unit(s) short · ${insights.externalSupportWouldHelp ? 'Support may help' : 'Review staffing'}`
          : 'Slot coverage capacity looks sufficient',
      percent: percents.coverageHealthPercent,
    },
    staffAvailability: {
      label: `${percents.staffAvailabilityPercent}%`,
      level: levelFromPercent(percents.staffAvailabilityPercent),
      detail: `${summary.availableStaffHours}h available of ${summary.requiredStaffHours}h required`,
      percent: percents.staffAvailabilityPercent,
    },
    constraintHealth: {
      label: `${percents.constraintHealthPercent}%`,
      level: levelFromPercent(percents.constraintHealthPercent),
      detail:
        criticalCount + warningCount === 0
          ? 'No constraint blockers detected'
          : `${criticalCount} critical · ${warningCount} warning`,
      percent: percents.constraintHealthPercent,
    },
    scheduleQuality: {
      label: `${percents.scheduleQualityPercent}%`,
      level: levelFromStatus(status),
      detail: `Pre-solve quality estimate (${status.toLowerCase().replace('_', ' ')})`,
      percent: percents.scheduleQualityPercent,
    },
    fairnessHealth: {
      label: `${percents.fairnessHealthPercent}%`,
      level: levelFromPercent(percents.fairnessHealthPercent),
      detail: insights.leaveIsMainBlocker
        ? 'Leave is the main blocker this week'
        : 'Estimated fairness balance before solve',
      percent: percents.fairnessHealthPercent,
    },
  };
}

export function impossibleDaysFromAnalysis(analysis: ConstraintAnalysisResult): string[] {
  if (analysis.impossibleDays?.length) return analysis.impossibleDays;
  const days = new Set<string>();
  for (const issue of analysis.issues) {
    if (issue.severity === 'critical' && issue.date) days.add(issue.date);
  }
  return Array.from(days).sort();
}
