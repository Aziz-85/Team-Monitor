'use client';

import { useState } from 'react';
import type { SmartRecommendation } from '@/lib/schedule/recommendationEngine';

type Props = {
  recommendations: SmartRecommendation[];
  formatDayLabel?: (date: string) => string;
  editWeekUrl?: string;
  t: (key: string) => string;
};

function impactClass(impact: SmartRecommendation['impact']): string {
  switch (impact) {
    case 'high':
      return 'text-emerald-800';
    case 'medium':
      return 'text-amber-800';
    case 'low':
      return 'text-slate-700';
  }
}

function costLabel(cost: SmartRecommendation['cost'], t: (key: string) => string): string {
  const key = `schedule.v3.smartRec.costLevels.${cost}`;
  return (t(key) as string) || cost;
}

function fairnessLabel(f: SmartRecommendation['fairnessImpact'], t: (key: string) => string): string {
  const key = `schedule.v3.smartRec.fairness.${f}`;
  return (t(key) as string) || f;
}

function PreviewModal({
  rec,
  onClose,
  formatDayLabel,
  editWeekUrl,
  t,
}: {
  rec: SmartRecommendation;
  onClose: () => void;
  formatDayLabel?: (date: string) => string;
  editWeekUrl?: string;
  t: (key: string) => string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" aria-hidden onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-[60] max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl"
        role="dialog"
        aria-labelledby="smart-rec-preview-title"
      >
        <h3 id="smart-rec-preview-title" className="text-base font-semibold text-foreground">
          {(t('schedule.v3.smartRec.previewTitle') as string) || 'Preview this fix'}
        </h3>
        <p className="mt-2 text-sm font-medium text-foreground">{rec.title}</p>
        <p className="mt-1 text-sm text-muted">{rec.explanation}</p>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">
              {(t('schedule.v3.smartRec.impact') as string) || 'Impact'}
            </dt>
            <dd className={`font-semibold capitalize ${impactClass(rec.impact)}`}>{rec.impact}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">
              {(t('schedule.v3.smartRec.coverageAfter') as string) || 'Coverage after applying'}
            </dt>
            <dd className="font-semibold">{rec.coverageAfterPercent}%</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">
              {(t('schedule.v3.smartRec.costLabel') as string) || 'Cost'}
            </dt>
            <dd className="font-medium">{costLabel(rec.cost, t)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">
              {(t('schedule.v3.smartRec.fairnessImpact') as string) || 'Fairness impact'}
            </dt>
            <dd className="font-medium">{fairnessLabel(rec.fairnessImpact, t)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-muted">
              {(t('schedule.v3.smartRec.slotsResolved') as string) || 'Slots resolved (est.)'}
            </dt>
            <dd className="font-semibold">{rec.slotViolationsResolved}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {(t('schedule.v3.smartRec.requiredAction') as string) || 'Required action'}
          </p>
          <p className="mt-1 text-sm text-foreground">{rec.requiredAction}</p>
        </div>

        {rec.affectedTimeRanges.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {(t('schedule.v3.smartRec.affectedTimes') as string) || 'Days / times affected'}
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {rec.affectedTimeRanges.map((r) => (
                <li key={`${r.date}-${r.startTime}`} className="font-mono text-xs">
                  {formatDayLabel ? formatDayLabel(r.date) : r.date} · {r.startTime}–{r.endTime}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-subtle"
          >
            {t('common.close') || 'Close'}
          </button>
          {editWeekUrl && (
            <a
              href={editWeekUrl}
              className="inline-flex h-9 items-center rounded-lg bg-[#0F4C3A] px-4 text-sm font-semibold text-white"
            >
              {(t('schedule.v3.smartRec.openEditor') as string) || 'Open Schedule Editor'}
            </a>
          )}
        </div>
      </div>
    </>
  );
}

export function SmartRecommendationsPanel({
  recommendations,
  formatDayLabel,
  editWeekUrl,
  t,
}: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = recommendations.find((r) => r.id === previewId) ?? null;

  if (!recommendations.length) return null;

  return (
    <>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <h2 className="text-sm font-semibold text-indigo-950">
          {(t('schedule.v3.smartRec.title') as string) || 'Smart Recommendations'}
        </h2>
        <p className="mt-0.5 text-xs text-indigo-900/80">
          {(t('schedule.v3.smartRec.subtitle') as string) ||
            'Top ranked fixes — preview only; nothing is applied automatically.'}
        </p>

        <ol className="mt-4 space-y-3">
          {recommendations.map((rec, index) => (
            <li
              key={rec.id}
              className="rounded-lg border border-indigo-200/60 bg-white/70 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-indigo-800">
                    #{index + 1} · <span className="capitalize">{rec.impact} impact</span>
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{rec.title}</p>
                  <p className="mt-1 text-xs text-muted line-clamp-2">{rec.explanation}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewId(rec.id)}
                  className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-50"
                >
                  {(t('schedule.v3.smartRec.preview') as string) || 'Preview this fix'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-medium uppercase tracking-wide text-indigo-900/70">
                <span>
                  {(t('schedule.v3.smartRec.coverageAfter') as string) || 'Coverage'}:{' '}
                  {rec.coverageAfterPercent}%
                </span>
                <span>{costLabel(rec.cost, t)}</span>
                <span>{fairnessLabel(rec.fairnessImpact, t)}</span>
                {rec.slotViolationsResolved > 0 && (
                  <span>~{rec.slotViolationsResolved} slots</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {preview && (
        <PreviewModal
          rec={preview}
          onClose={() => setPreviewId(null)}
          formatDayLabel={formatDayLabel}
          editWeekUrl={editWeekUrl}
          t={t}
        />
      )}
    </>
  );
}
