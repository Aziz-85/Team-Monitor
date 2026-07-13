/** Targets module facade (Architecture Stabilization Phase 5). */

export { getBoutiqueTarget, type GetBoutiqueTargetInput } from '@/lib/targets/getBoutiqueTarget';
export { getEmployeeTarget, type GetEmployeeTargetInput } from '@/lib/targets/getEmployeeTarget';
export {
  lookupBoutiqueMonthlyTarget,
  sumBoutiqueMonthlyTargets,
  type BoutiqueMonthlyTargetLookup,
} from '@/lib/targets/boutiqueMonthlyTargetLookup';
export type {
  TargetStatus,
  ResolvedBoutiqueTarget,
  ResolvedEmployeeTarget,
} from '@/lib/targets/types';
