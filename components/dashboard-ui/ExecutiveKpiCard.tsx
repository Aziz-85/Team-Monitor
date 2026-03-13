'use client';

import {
  EXECUTIVE_CARD_BORDER,
  EXECUTIVE_CARD_BG,
  EXECUTIVE_GOLD,
} from '@/lib/chartStyles';

/**
 * Canonical executive KPI card — compact, premium, gold accent.
 * Uses executive theme (border, bg, gold progress bar).
 * Distinct from PerformanceKpiCard (Home/Sales Summary) which uses emerald/amber/red.
 * pctColor: 90+ = emerald, 20+ = muted, else amber (for value display).
 */

function pctColor(pct: number): string {
  if (pct >= 90) return 'text-emerald-600';
  if (pct >= 20) return 'text-muted';
  return 'text-amber-700';
}

export type ExecutiveKpiCardProps = {
  title: string;
  value: string | number;
  delta?: string | null;
  /** Used for value color and optional progress bar */
  pct?: number;
  showPctBar?: boolean;
};

export function ExecutiveKpiCard({
  title,
  value,
  delta,
  pct,
  showPctBar = false,
}: ExecutiveKpiCardProps) {
  const colorClass = pct != null ? pctColor(pct) : 'text-foreground';

  return (
    <div
      className="rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
      style={{ borderColor: EXECUTIVE_CARD_BORDER, backgroundColor: EXECUTIVE_CARD_BG }}
    >
      <p className="text-sm text-muted">{title}</p>
      <p className={`text-3xl font-semibold ${colorClass}`}>{value}</p>
      {delta != null && delta !== '' && (
        <p className="mt-1 text-xs text-muted">{delta}</p>
      )}
      {showPctBar && pct != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, pct))}%`,
              backgroundColor: EXECUTIVE_GOLD,
            }}
          />
        </div>
      )}
    </div>
  );
}
