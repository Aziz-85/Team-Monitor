/**
 * Monthly target allocation reconciliation helpers.
 *
 * All amounts are SAR integers.
 */

export type AllocationStatus = 'BALANCED' | 'UNDER' | 'OVER';

/**
 * Compute total employee target from a list of rows.
 */
export function computeEmployeesTotal<T extends { amount: number }>(
  employeeTargets: T[]
): number {
  if (!Array.isArray(employeeTargets) || employeeTargets.length === 0) return 0;
  return employeeTargets.reduce((sum, row) => {
    const v = Number(row.amount);
    if (!Number.isFinite(v) || v < 0) return sum;
    return sum + Math.round(v);
  }, 0);
}

/**
 * Compute diff between boutique target and employees total.
 * Positive diff => UNDER-allocated (employeesTotal < boutiqueTarget).
 * Negative diff => OVER-allocated (employeesTotal > boutiqueTarget).
 */
export function computeDiff(
  boutiqueTargetSar: number,
  employeesTotalSar: number
): number {
  const bt = Math.max(0, Math.round(Number(boutiqueTargetSar) || 0));
  const et = Math.max(0, Math.round(Number(employeesTotalSar) || 0));
  return bt - et;
}

/**
 * Map diff to a high-level status.
 */
export function getAllocationStatus(diffSar: number): AllocationStatus {
  if (diffSar === 0) return 'BALANCED';
  return diffSar > 0 ? 'UNDER' : 'OVER';
}

