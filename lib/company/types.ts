import type { PaceBand, ProductivityMetrics } from '@/lib/analytics/performanceLayer';
import type { Role } from '@prisma/client';

export type CompanyAlertKind =
  | 'BRANCH_BEHIND_PACE'
  | 'BRANCH_MISSING_BOUTIQUE_TARGET'
  | 'BRANCH_NO_SALES_ACTIVITY';

/** Executive severity tier (high → low). */
export type CompanyAlertLevel = 'high' | 'medium' | 'low';

export type CompanyAlertItem = {
  kind: CompanyAlertKind;
  level: CompanyAlertLevel;
  boutiqueId: string;
  boutiqueCode: string;
  boutiqueName: string;
  values: Record<string, string | number>;
};

export type CompanyBranchRow = {
  boutiqueId: string;
  code: string;
  name: string;
  actualMtd: number;
  targetMtd: number;
  remaining: number;
  achievementPct: number | null;
  paceBand: PaceBand;
  paceDelta: number;
  forecastEom: number;
  forecastDelta: number;
  employeeCount: number;
  alertCount: number;
};

export type CompanyOverviewPayload = {
  monthKey: string;
  daysInMonth: number;
  daysPassed: number;
  networkActualMtd: number;
  networkTargetMtd: number;
  networkRemaining: number;
  paceBand: PaceBand;
  paceDelta: number;
  forecastEom: number;
  forecastDelta: number;
  activeBoutiqueCount: number;
  activeEmployeeCount: number;
  branchSummaries: CompanyBranchRow[];
  topBranches: CompanyBranchRow[];
  bottomBranches: CompanyBranchRow[];
  alertsPreview: CompanyAlertItem[];
  employeeHighlights: Array<{
    userId: string;
    empId: string;
    name: string;
    nameAr: string | null;
    boutiqueCode: string;
    actualMtd: number;
  }>;
};

export type CompanyEmployeeRow = {
  userId: string;
  empId: string;
  name: string;
  nameAr: string | null;
  boutiqueId: string;
  boutiqueCode: string;
  boutiqueName: string;
  role: Role;
  actualMtd: number;
  targetMtd: number | null;
  achievementPct: number | null;
  paceBand: PaceBand;
  paceDelta: number;
  productivity: ProductivityMetrics | null;
};
