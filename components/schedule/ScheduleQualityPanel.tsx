'use client';

import type { ScheduleQualityMetrics } from '@/lib/schedule/scheduleUiMetrics';
import { qualityPercentsFromSolve } from '@/lib/schedule/scheduleQuality';

type Props = {
  metrics: ScheduleQualityMetrics;
  /** Raw internal fairness score — shown in Technical Details only. */
  rawFairnessScore?: number | null;
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

function toneFromPercent(p: number): 'good' | 'warn' | 'neutral' {
  if (p >= 85) return 'good';
  if (p >= 60) return 'warn';
  return 'neutral';
}

export function ScheduleQualityPanel({ metrics, rawFairnessScore, t }: Props) {
  const percents = qualityPercentsFromSolve(metrics, rawFairnessScore);

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {(t('schedule.quality.title') as string) || 'Schedule quality'}
        </h3>
        <span className="text-[10px] text-muted">
          {(t('schedule.quality.subtitle') as string) || 'Engine v3 · post-solve'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label={(t('schedule.v3.healthCheck.scheduleQuality') as string) || 'Schedule Quality'}
          value={`${percents.scheduleQualityPercent}%`}
          tone={toneFromPercent(percents.scheduleQualityPercent)}
        />
        <MetricCard
          label={(t('schedule.v3.healthCheck.coverageHealth') as string) || 'Coverage Health'}
          value={`${percents.coverageHealthPercent}%`}
          tone={toneFromPercent(percents.coverageHealthPercent)}
        />
        <MetricCard
          label={(t('schedule.v3.healthCheck.staffAvailability') as string) || 'Staff Availability'}
          value={`${percents.staffAvailabilityPercent}%`}
          tone={toneFromPercent(percents.staffAvailabilityPercent)}
        />
        <MetricCard
          label={(t('schedule.v3.healthCheck.constraintHealth') as string) || 'Constraint Health'}
          value={`${percents.constraintHealthPercent}%`}
          tone={toneFromPercent(percents.constraintHealthPercent)}
        />
        <MetricCard
          label={(t('schedule.v3.healthCheck.fairnessHealth') as string) || 'Fairness Health'}
          value={`${percents.fairnessHealthPercent}%`}
          tone={toneFromPercent(percents.fairnessHealthPercent)}
        />
      </div>
      {(rawFairnessScore != null || metrics.slotViolationCount > 0) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            {(t('schedule.v3.healthCheck.technicalDetails') as string) || 'Technical Details'}
          </summary>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted">Slot violations</dt>
              <dd className="font-mono font-semibold">{metrics.slotViolationCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Split days used</dt>
              <dd className="font-mono font-semibold">{metrics.splitCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Overtime shifts</dt>
              <dd className="font-mono font-semibold">{metrics.overtimeCount}</dd>
            </div>
            <div>
              <dt className="text-muted">External support</dt>
              <dd className="font-mono font-semibold">{metrics.externalSupportCount}</dd>
            </div>
            {rawFairnessScore != null && (
              <div className="col-span-2">
                <dt className="text-muted">Raw fairness score (internal)</dt>
                <dd className="font-mono font-semibold">{rawFairnessScore.toFixed(1)}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
