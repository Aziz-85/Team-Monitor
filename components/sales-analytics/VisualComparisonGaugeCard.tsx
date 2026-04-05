'use client';

import type { SalesAnalyticsComparison, SalesAnalyticsPayload } from '@/lib/sales-analytics/types';
import {
  comparisonGaugeSubtitleKey,
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

const GAUGE_STROKE: Record<SalesAnalyticsComparison['signal'], string> = {
  good: 'stroke-emerald-500/95 dark:stroke-emerald-400/95',
  warning: 'stroke-amber-500/95 dark:stroke-amber-400/90',
  risk: 'stroke-rose-500/95 dark:stroke-rose-400/95',
};

/** Upper semicircle path; length = π × radius. */
const R = 92;
const CX = 128;
const CY = 126;
const ARC_PATH = `M ${CX - R} ${CY} A ${R} ${R} 0 0 0 ${CX + R} ${CY}`;
const ARC_LEN = Math.PI * R;
const STROKE = 18;

function ExecutiveSemiGauge({
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
    <div className="relative aspect-[128/70] w-full max-w-[19rem] sm:max-w-[21rem]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 256 140" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <path d={ARC_PATH} fill="none" className="stroke-muted-foreground/18" strokeWidth={STROKE} strokeLinecap="round" />
        <path
          d={ARC_PATH}
          fill="none"
          className={muted ? 'stroke-muted-foreground/25' : GAUGE_STROKE[signal]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${ARC_LEN}`}
        />
      </svg>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 tabular-nums">
      <span className="min-w-0 shrink text-[10px] font-medium uppercase tracking-wide text-muted-foreground/85">{label}</span>
      <span className="text-[11px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function VisualComparisonGaugeCard({
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
  const amounts = formatComparisonAmounts(c);
  const row = comparisonRowLabelKeys(c.id);
  const subKey = comparisonGaugeSubtitleKey(c.id);
  const sigLabel =
    c.signal === 'good'
      ? t('salesAnalytics.signalGood')
      : c.signal === 'risk'
        ? t('salesAnalytics.signalRisk')
        : t('salesAnalytics.signalWatch');

  const muted = derived.arcFillPct == null;
  const footnote = derived.footnoteKey ? t(derived.footnoteKey) : null;
  const achFmt = Number.isFinite(kpis.mtdAchPct) ? `${kpis.mtdAchPct}%` : '—';

  return (
    <article className="flex h-full min-h-[21rem] flex-col rounded-xl border border-border bg-surface p-4 shadow-sm sm:min-h-[22.5rem] sm:p-5">
      {/* A. Header */}
      <header className="shrink-0 px-0.5 text-center">
        <h3 className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-muted-foreground">{title}</h3>
      </header>

      {/* B–D. Gauge + KPI (dominant): stacked so the arc stays large and the number sits in the gauge focal area */}
      <div className="relative mt-0.5 flex shrink-0 flex-col items-center sm:mt-1.5">
        <div className="relative grid w-full max-w-[21rem] place-items-center [grid-template-areas:'stack'] px-0.5">
          <div className="[grid-area:stack] w-full place-self-center">
            <div className="rounded-xl bg-surface-subtle/40 px-0.5 pt-1 dark:bg-surface-subtle/25">
              <ExecutiveSemiGauge fillPct={derived.arcFillPct} signal={c.signal} muted={muted} />
            </div>
          </div>
          <div className="pointer-events-none [grid-area:stack] flex w-full flex-col items-center justify-start pt-[12%] text-center sm:pt-[14%]">
            <p className="max-w-[14rem] text-[2.1rem] font-bold leading-none tracking-tight text-foreground sm:text-[2.45rem] md:text-[2.65rem]">
              {derived.centerLabel}
            </p>
            <p className="mt-1.5 max-w-[13rem] px-2 text-[10px] font-medium leading-snug text-muted-foreground sm:text-[11px]">
              {t(subKey)}
            </p>
          </div>
        </div>
      </div>

      {/* E. Compact details */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-end space-y-1 sm:mt-4">
        <div className="space-y-1 border-t border-border/45 pt-2.5">
          {c.id === 'mtdActualVsTarget' ? (
            <>
              <DetailRow label={t(row.currentKey)} value={amounts.currentFmt} />
              <DetailRow label={t(row.refKey)} value={amounts.refFmt} />
              <DetailRow label={t('salesAnalytics.kpiRemaining')} value={formatSarInt(Math.max(0, kpis.remainingSar))} />
              <DetailRow label={t('salesAnalytics.kpiMtdAch')} value={achFmt} />
            </>
          ) : (
            <>
              <DetailRow label={t(row.currentKey)} value={amounts.currentFmt} />
              <DetailRow label={t(row.refKey)} value={amounts.refFmt} />
              <DetailRow label={t('salesAnalytics.delta')} value={amounts.deltaFmt} />
              <DetailRow label={t('salesAnalytics.deltaPct')} value={amounts.deltaPctFmt} />
            </>
          )}
        </div>
      </div>

      {/* F. Footer */}
      <footer className="mt-3 shrink-0 space-y-2 border-t border-border/35 pt-3">
        <div className="flex justify-center">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${SIGNAL_CHIP[c.signal]}`}>{sigLabel}</span>
        </div>
        {footnote ? <p className="text-center text-[10px] leading-snug text-muted-foreground">{footnote}</p> : null}
      </footer>
    </article>
  );
}
