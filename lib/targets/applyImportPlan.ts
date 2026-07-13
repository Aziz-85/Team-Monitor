import type { BoutiquePreviewResult } from './importBoutiques';
import type { EmployeePreviewResult } from './importEmployees';
import {
  boutiqueApplyPlanSchema,
  employeeApplyPlanSchema,
} from '@/lib/validation/schemas/targetsImport';

export type BoutiqueApplyPlan = Pick<BoutiquePreviewResult, 'inserts' | 'updates'>;
export type EmployeeApplyPlan = Pick<EmployeePreviewResult, 'inserts' | 'updates'>;

export function parseBoutiqueApplyPlan(raw: unknown, allowedBoutiqueIds: string[]): BoutiqueApplyPlan | null {
  const result = boutiqueApplyPlanSchema(allowedBoutiqueIds).safeParse(raw);
  return result.success ? result.data : null;
}

export function parseEmployeeApplyPlan(raw: unknown, allowedBoutiqueIds: string[]): EmployeeApplyPlan | null {
  const result = employeeApplyPlanSchema(allowedBoutiqueIds).safeParse(raw);
  return result.success ? result.data : null;
}
