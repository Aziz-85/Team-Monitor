/**
 * Employee performance from canonical SalesEntry + central employee target.
 */

import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { getEmployeeTarget } from '@/lib/targets/getEmployeeTarget';
import { sumEmployeeSales } from '@/lib/sales/attribution';
import { normalizeMonthKey, formatMonthKey } from '@/lib/time';
import type { EmployeePerformanceResult } from '@/lib/sales/types';

export type GetEmployeePerformanceInput = {
  userId: string;
  boutiqueId: string;
  fromDate: Date;
  toDate: Date;
  monthKey?: string;
  crossBoutique?: boolean;
  routeName?: string;
};

export async function getEmployeePerformance(
  input: GetEmployeePerformanceInput
): Promise<EmployeePerformanceResult> {
  const monthKey = normalizeMonthKey(
    input.monthKey ?? formatMonthKey(input.fromDate)
  );
  const sales = await sumEmployeeSales({
    userId: input.userId,
    fromDate: input.fromDate,
    toDate: input.toDate,
  });

  const resolvedTarget = await getEmployeeTarget({
    userId: input.userId,
    boutiqueId: input.boutiqueId,
    monthKey,
    crossBoutique: input.crossBoutique,
    routeName: input.routeName ?? 'getEmployeePerformance',
  });

  const target = resolvedTarget.amountSar;
  const targetStatus = resolvedTarget.status;
  const achievement = resolvedTarget.hasMonthlyTarget
    ? calculatePerformance({ target: target ?? 0, sales })
    : null;

  return {
    userId: input.userId,
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
    warnings:
      targetStatus === 'missing'
        ? ['No employee target assigned for this period.']
        : [],
  };
}

/** @deprecated Use getEmployeePerformance */
export const calculateEmployeePerformance = getEmployeePerformance;
export type CalculateEmployeePerformanceInput = GetEmployeePerformanceInput;
