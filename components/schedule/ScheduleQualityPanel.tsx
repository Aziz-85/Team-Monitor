'use client';

import type { ScheduleQualityMetrics } from '@/lib/schedule/scheduleUiMetrics';

type Props = {
  metrics: ScheduleQualityMetrics;
  fairnessScore?: number | null;
  t: (key: string) => string;
};

function MetricCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'neutral';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-border bg-surface-subtle text-foreground';
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

export function ScheduleQualityPanel({ metrics, fairnessScore, t }: Props) {
  const coverageLabel = metrics.coverageValid
    ? (t('schedule.quality.valid') as string) || 'Valid'
    : (t('schedule.quality.needsAttention') as string) || 'Needs attention';

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {(t('schedule.quality.title') as string) || 'Schedule quality'}
        </h3>
        <span className="text-[10px] text-muted">
          {(t('schedule.quality.subtitle') as string) || 'Engine v3 · 30-min slot validation'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label={(t('schedule.quality.coverage') as string) || 'Coverage'}
          value={coverageLabel}
          tone={metrics.coverageValid ? 'good' : 'warn'}
        />
        <MetricCard
          label={(t('schedule.quality.slotViolations') as string) || 'Slot violations'}
          value={String(metrics.slotViolationCount)}
          tone={metrics.slotViolationCount === 0 ? 'good' : 'warn'}
        />
        <MetricCard
          label={(t('schedule.quality.splitUsed') as string) || 'Split used'}
          value={String(metrics.splitCount)}
        />
        <MetricCard
          label={(t('schedule.quality.overtime') as string) || 'Overtime'}
          value={String(metrics.overtimeCount)}
          tone={metrics.overtimeCount > 0 ? 'warn' : 'neutral'}
        />
        <MetricCard
          label={(t('schedule.quality.fairness') as string) || 'Fairness score'}
          value={fairnessScore != null ? fairnessScore.toFixed(1) : '—'}
        />
        <MetricCard
          label={(t('schedule.quality.externalSupport') as string) || 'External support'}
          value={String(metrics.externalSupportCount)}
        />
      </div>
    </div>
  );
}
