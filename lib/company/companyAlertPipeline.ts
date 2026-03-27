/**
 * Dedupe, sort, and normalize company alerts for display (read-only).
 */

import type { CompanyAlertItem, CompanyAlertKind, CompanyAlertLevel } from '@/lib/company/types';

const LEVEL_ORDER: Record<CompanyAlertLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const COMPANY_ALERT_KIND_ORDER: Record<CompanyAlertKind, number> = {
  BRANCH_NO_SALES_ACTIVITY: 0,
  BRANCH_BEHIND_PACE: 1,
  BRANCH_MISSING_BOUTIQUE_TARGET: 2,
};

/**
 * - Drops **behind pace** for a boutique when **no sales** is already flagged (stronger, avoids duplicate narrative).
 * - Drops accidental duplicate rows (same kind + boutique).
 * - Sorts: level (high→low), kind importance, then worst pace gap, then boutique code.
 */
export function dedupeAndSortCompanyAlerts(alerts: CompanyAlertItem[]): CompanyAlertItem[] {
  const kindsByBoutique = new Map<string, Set<CompanyAlertKind>>();
  for (const a of alerts) {
    if (!kindsByBoutique.has(a.boutiqueId)) kindsByBoutique.set(a.boutiqueId, new Set());
    kindsByBoutique.get(a.boutiqueId)!.add(a.kind);
  }

  const filtered = alerts.filter((a) => {
    if (a.kind === 'BRANCH_BEHIND_PACE') {
      if (kindsByBoutique.get(a.boutiqueId)?.has('BRANCH_NO_SALES_ACTIVITY')) return false;
    }
    return true;
  });

  const seen = new Set<string>();
  const unique = filtered.filter((a) => {
    const k = `${a.kind}\0${a.boutiqueId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return [...unique].sort((a, b) => {
    const ld = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (ld !== 0) return ld;
    const kd = COMPANY_ALERT_KIND_ORDER[a.kind] - COMPANY_ALERT_KIND_ORDER[b.kind];
    if (kd !== 0) return kd;
    if (a.kind === 'BRANCH_BEHIND_PACE' && b.kind === 'BRANCH_BEHIND_PACE') {
      return (Number(a.values.paceDelta) || 0) - (Number(b.values.paceDelta) || 0);
    }
    return a.boutiqueCode.localeCompare(b.boutiqueCode);
  });
}
