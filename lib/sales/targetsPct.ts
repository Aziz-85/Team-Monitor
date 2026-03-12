/**
 * Target/sales percent utilities. SAR_INT only. Integer division.
 */

/** pct = (targetSar > 0) ? floor((achievedSar * 100) / targetSar) : 0 */
export function computePct(achievedSar: number, targetSar: number): number {
  if (!Number.isFinite(targetSar) || targetSar <= 0) return 0;
  return Math.floor((Number(achievedSar) * 100) / targetSar);
}

/** remainingPct = 100 - min(pct, 100) for progress bar display */
export function remainingPctDisplay(pct: number): number {
  return 100 - Math.min(pct, 100);
}
