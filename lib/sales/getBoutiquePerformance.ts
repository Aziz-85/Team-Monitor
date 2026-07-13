/**
 * Boutique performance from canonical SalesEntry + central boutique target.
 */

import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { getBoutiqueTarget } from '@/lib/targets/getBoutiqueTarget';
import { sumBoutiqueSales } from '@/lib/sales/attribution';
import { normalizeMonthKey, formatMonthKey } from '@/lib/time';
import type { BoutiquePerformanceResult } from '@/lib/sales/types';

export type GetBoutiquePerformanceInput = {
  boutiqueId: string;
  fromDate: Date;
  toDate: Date;
  monthKey?: string;
  routeName?: string;
};

export async function getBoutiquePerformance(
  input: GetBoutiquePerformanceInput
): Promise<BoutiquePerformanceResult> {
  const monthKey = normalizeMonthKey(
    input.monthKey ?? formatMonthKey(input.fromDate)
  );
  const sales = await sumBoutiqueSales({
    boutiqueId: input.boutiqueId,
    fromDate: input.fromDate,
    toDate: input.toDate,
  });

  const resolvedTarget = await getBoutiqueTarget({
    boutiqueId: input.boutiqueId,
    monthKey,
    routeName: input.routeName ?? 'getBoutiquePerformance',
  });

  const target = resolvedTarget.amountSar;
  const targetStatus = resolvedTarget.status;
  const achievement = resolvedTarget.hasMonthlyTarget
    ? calculatePerformance({ target: target ?? 0, sales })
    : null;

  return {
    boutiqueId: input.boutiqueId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    sales,
    target,
    targetStatus,
    hasMonthlyTarget: resolvedTarget.hasMonthlyTarget,
    achievement: {
      remaining: achievement?.remaining ?? null,
      percent: achievement?.percent ?? null,
    },
  };
}

/** Sum sales by boutique for a user in a period (coverage / multi-branch view). */
export { sumEmployeeSalesByBoutique as getSalesBreakdownByBoutiqueForEmployee } from '@/lib/sales/attribution';

/** @deprecated Use getBoutiquePerformance */
export const calculateBoutiquePerformance = getBoutiquePerformance;
export type CalculateBoutiquePerformanceInput = GetBoutiquePerformanceInput;
