import { lookupBoutiqueMonthlyTarget } from '@/lib/targets/boutiqueMonthlyTargetLookup';
import type { ResolvedBoutiqueTarget } from '@/lib/targets/types';

export type GetBoutiqueTargetInput = {
  boutiqueId: string;
  monthKey: string;
  routeName: string;
};

/** Central boutique monthly target resolver. Missing rows → status `missing`, not zero. */
export async function getBoutiqueTarget(
  input: GetBoutiqueTargetInput
): Promise<ResolvedBoutiqueTarget> {
  const lookup = await lookupBoutiqueMonthlyTarget(input);
  return {
    status: lookup.hasTarget ? 'assigned' : 'missing',
    amountSar: lookup.hasTarget ? lookup.amount : null,
    hasMonthlyTarget: lookup.hasTarget,
    monthKey: lookup.month,
    boutiqueId: lookup.boutiqueId,
  };
}
