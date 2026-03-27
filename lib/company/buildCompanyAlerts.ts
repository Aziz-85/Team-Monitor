/**
 * Read-only central alerts derived from branch comparison rows (no speculative data).
 */

import type { CompanyMonthContext } from '@/lib/company/companyMonthContext';
import { buildCompanyBranchComparison } from '@/lib/company/buildCompanyBranchComparison';
import { dedupeAndSortCompanyAlerts } from '@/lib/company/companyAlertPipeline';
import type { CompanyAlertItem, CompanyBranchRow } from '@/lib/company/types';

const NO_SALES_MIN_DAY = 3;

export function deriveCompanyAlertsFromBranchRows(
  rows: CompanyBranchRow[],
  ctx: CompanyMonthContext
): CompanyAlertItem[] {
  const raw: CompanyAlertItem[] = [];
  for (const r of rows) {
    if (r.employeeCount > 0 && r.targetMtd === 0) {
      raw.push({
        kind: 'BRANCH_MISSING_BOUTIQUE_TARGET',
        level: 'low',
        boutiqueId: r.boutiqueId,
        boutiqueCode: r.code,
        boutiqueName: r.name,
        values: { branch: r.name, code: r.code },
      });
    }
    if (r.targetMtd > 0 && r.paceBand === 'behind') {
      raw.push({
        kind: 'BRANCH_BEHIND_PACE',
        level: 'medium',
        boutiqueId: r.boutiqueId,
        boutiqueCode: r.code,
        boutiqueName: r.name,
        values: {
          branch: r.name,
          code: r.code,
          paceDelta: r.paceDelta,
        },
      });
    }
    if (
      r.targetMtd > 0 &&
      r.actualMtd === 0 &&
      ctx.daysPassed >= NO_SALES_MIN_DAY &&
      ctx.monthKey === ctx.currentMonthKey
    ) {
      raw.push({
        kind: 'BRANCH_NO_SALES_ACTIVITY',
        level: 'high',
        boutiqueId: r.boutiqueId,
        boutiqueCode: r.code,
        boutiqueName: r.name,
        values: { branch: r.name, code: r.code, daysPassed: ctx.daysPassed },
      });
    }
  }
  return dedupeAndSortCompanyAlerts(raw);
}

export function attachAlertCountsToBranches(
  rows: CompanyBranchRow[],
  alerts: CompanyAlertItem[]
): CompanyBranchRow[] {
  const counts = new Map<string, number>();
  for (const a of alerts) {
    counts.set(a.boutiqueId, (counts.get(a.boutiqueId) ?? 0) + 1);
  }
  return rows.map((r) => ({ ...r, alertCount: counts.get(r.boutiqueId) ?? 0 }));
}

export async function buildCompanyAlerts(
  boutiqueIds: string[],
  ctx: CompanyMonthContext
): Promise<CompanyAlertItem[]> {
  if (boutiqueIds.length === 0) return [];
  const rows = await buildCompanyBranchComparison(boutiqueIds, ctx);
  return deriveCompanyAlertsFromBranchRows(rows, ctx);
}
