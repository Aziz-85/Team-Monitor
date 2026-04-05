'use client';

import type { SalesAnalyticsComparison, SalesAnalyticsPayload } from '@/lib/sales-analytics/types';
import {
  comparisonRowLabelKeys,
  deriveVisualComparison,
  formatComparisonAmounts,
} from '@/lib/sales-analytics/comparisonLabels';
import { formatSarInt } from '@/lib/utils/money';

const SIGNAL_CHIP: Record<SalesAnalyticsComparison['signal'], string> = {
  good: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  warning: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  risk: 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
};

const STROKE: Record<SalesAnalyticsComparison['signal'], string> = {
  good: 'stroke-emerald-500 dark:stroke-emerald-400',
  warning: 'stroke-amber-500 dark:stroke-amber-400',
  risk: 'stroke-rose-500 dark:stroke-rose-400',
};

/** Semicircle track + value arc; length matches path M 18 76 A 62 62 0 0 0 122 76 (radius 62). */
const ARC_LEN = Math.PI * 62;

function SemiGauge({
  fillPct,
  signal,
  muted,
}: {
  fillPct: number | null;
  signal: SalesAnalyticsComparison['signal'];
  muted: boolean;
}) {
  const pct = fillPct == null || muted ? 0 : Math.min(100, Math.max(0, fillPct));
  const dash = (pct / 100) * ARC_LEN;

  return (
    <svg
      className="mx-auto h-[5.5rem] w-[8.75rem] shrink-0 overflow-visible"
      viewBox="0 0 140 88"
      aria-hidden
    >
      <path
        d="M 18 76 A 62 62 0 0 0 122 76"
        fill="none"
        className="stroke-border/80"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 18 76 A 62 62 0 0 0 122 76"
        fill="none"
        className={muted ? 'stroke-muted-foreground/35' : STROKE[signal]}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${ARC_LEN}`}
      />
    </svg>
  );
}

export function VisualComparisonCard({
  comparison: c,
  kpis,
  title,
  t,
}: {
  comparison: SalesAnalyticsComparison;
  kpis: SalesAnalyticsPayload['kpis'];
  title: string;
  t: (key: string) => string;
}) {
  const derived = deriveVisualComparison(c, kpis);
  const { currentFmt, refFmt, deltaFmt, deltaPctFmt } = formatComparisonAmounts(c);
  const row = comparisonRowLabelKeys(c.id);
  const sigLabel =
    c.signal === 'good'
      ? t('salesAnalytics.signalGood')
      : c.signal === 'risk'
        ? t('salesAnalytics.signalRisk')
        : t('salesAnalytics.signalWatch');

  const muted = derived.arcFillPct == null;
  const footnote = derived.footnoteKey ? t(derived.footnoteKey) : null;

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-center text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>

      <div className="relative mt-1 min-h-[5.5rem]">
        <SemiGauge fillPct={derived.arcFillPct} signal={c.signal} muted={muted} />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-0.5 pt-2 text-center">
          <p className="text-2xl font-bold tabular-nums leading-tight text-foreground">{derived.centerLabel}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {c.id === 'mtdActualVsTarget'
              ? t('salesAnalytics.visualLabelAch')
              : c.id === 'mtdActualVsPace'
                ? t('salesAnalytics.visualLabelPace')
                : t('salesAnalytics.visualLabelDelta')}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs">
        <div className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted">{t(row.currentKey)}</span>
          <span className="font-medium text-foreground">{currentFmt}</span>
        </div>
        <div className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted">{t(row.refKey)}</span>
          <span className="font-medium text-foreground">{refFmt}</span>
        </div>
        <div className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted">{t('salesAnalytics.delta')}</span>
          <span className="font-medium text-foreground">{deltaFmt}</span>
        </div>
        <div className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted">{t('salesAnalytics.deltaPct')}</span>
          <span className="font-medium text-foreground">{deltaPctFmt}</span>
        </div>
        {c.id === 'mtdActualVsTarget' ? (
          <div className="flex justify-between gap-2 border-t border-border/40 pt-2 tabular-nums">
            <span className="shrink-0 text-muted">{t('salesAnalytics.kpiRemaining')}</span>
            <span className="min-w-0 text-end font-medium text-foreground">{formatSarInt(Math.max(0, kpis.remainingSar))}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${SIGNAL_CHIP[c.signal]}`}>{sigLabel}</span>
      </div>

      {footnote ? <p className="mt-2 text-center text-[11px] leading-snug text-muted">{footnote}</p> : null}
    </article>
  );
}
