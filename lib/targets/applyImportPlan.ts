import type { BoutiquePreviewResult } from './importBoutiques';
import type { EmployeePreviewResult } from './importEmployees';

export type BoutiqueApplyPlan = Pick<BoutiquePreviewResult, 'inserts' | 'updates'>;
export type EmployeeApplyPlan = Pick<EmployeePreviewResult, 'inserts' | 'updates'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function parseBoutiqueApplyPlan(raw: unknown, allowedBoutiqueIds: string[]): BoutiqueApplyPlan | null {
  if (!isRecord(raw)) return null;
  const inserts = Array.isArray(raw.inserts) ? raw.inserts : null;
  const updates = Array.isArray(raw.updates) ? raw.updates : null;
  if (!inserts || !updates) return null;

  for (const row of inserts) {
    if (!isRecord(row) || typeof row.boutiqueId !== 'string' || !allowedBoutiqueIds.includes(row.boutiqueId)) {
      return null;
    }
  }
  for (const row of updates) {
    if (
      !isRecord(row) ||
      typeof row.boutiqueId !== 'string' ||
      typeof row.existingId !== 'string' ||
      !allowedBoutiqueIds.includes(row.boutiqueId)
    ) {
      return null;
    }
  }

  return { inserts: inserts as BoutiqueApplyPlan['inserts'], updates: updates as BoutiqueApplyPlan['updates'] };
}

export function parseEmployeeApplyPlan(raw: unknown, allowedBoutiqueIds: string[]): EmployeeApplyPlan | null {
  if (!isRecord(raw)) return null;
  const inserts = Array.isArray(raw.inserts) ? raw.inserts : null;
  const updates = Array.isArray(raw.updates) ? raw.updates : null;
  if (!inserts || !updates) return null;

  for (const row of inserts) {
    if (!isRecord(row) || typeof row.boutiqueId !== 'string' || !allowedBoutiqueIds.includes(row.boutiqueId)) {
      return null;
    }
  }
  for (const row of updates) {
    if (
      !isRecord(row) ||
      typeof row.boutiqueId !== 'string' ||
      typeof row.id !== 'string' ||
      !allowedBoutiqueIds.includes(row.boutiqueId)
    ) {
      return null;
    }
  }

  return { inserts: inserts as EmployeeApplyPlan['inserts'], updates: updates as EmployeeApplyPlan['updates'] };
}
