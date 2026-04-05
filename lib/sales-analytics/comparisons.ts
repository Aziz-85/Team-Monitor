/**
 * Pure comparison helpers for sales analytics (no I/O).
 */

import type { ComparisonSignal } from '@/lib/sales-analytics/types';

export function deltaAndPct(
  current: number,
  previous: number | null | undefined
): { delta: number | null; deltaPct: number | null } {
  if (previous == null || !Number.isFinite(previous)) return { delta: null, deltaPct: null };
  const delta = Math.trunc(current) - Math.trunc(previous);
  const prev = Math.trunc(previous);
  if (prev === 0) {
    if (Math.trunc(current) === 0) return { delta: 0, deltaPct: 0 };
    return { delta, deltaPct: null };
  }
  const deltaPct = Math.round(((Math.trunc(current) - prev) * 100) / Math.abs(prev));
  return { delta, deltaPct };
}

export function signalFromDeltaPct(deltaPct: number | null): ComparisonSignal {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return 'warning';
  if (deltaPct >= 3) return 'good';
  if (deltaPct <= -5) return 'risk';
  return 'warning';
}
