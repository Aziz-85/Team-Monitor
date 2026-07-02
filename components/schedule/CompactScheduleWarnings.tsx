'use client';

import { useMemo, useState } from 'react';
import type { GroupedWarning, WarningGroup } from '@/lib/schedule/scheduleUiMetrics';

type Props = {
  grouped: GroupedWarning[];
  coverageSummaries: Array<{ key: string; label: string; dates: string[] }>;
  daysNeedingAttention: number;
  formatDate: (date: string) => string;
  onFocusDay?: (date: string) => void;
  t: (key: string) => string;
};

const GROUP_LABEL_KEYS: Record<WarningGroup, string> = {
  coverage: 'schedule.warnings.groupCoverage',
  handover: 'schedule.warnings.groupHandover',
  keyHolder: 'schedule.warnings.groupKeyHolder',
  policy: 'schedule.warnings.groupPolicy',
};

export function CompactScheduleWarnings({
  grouped,
  coverageSummaries,
  daysNeedingAttention,
  formatDate,
  onFocusDay,
  t,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const preview = useMemo(() => grouped.slice(0, 2), [grouped]);
  const restCount = Math.max(0, grouped.length - 2);

  if (grouped.length === 0 && daysNeedingAttention === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
        {t('coverage.noWarnings')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('coverage.title')}</h3>
          <p className="text-xs text-muted">
            {(t('schedule.daysNeedingAttention') as string)?.replace?.('{n}', String(daysNeedingAttention)) ??
              `${daysNeedingAttention} days need attention`}
          </p>
        </div>
        {restCount > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground hover:bg-surface"
          >
            {(t('schedule.warnings.more') as string)?.replace?.('{n}', String(restCount)) ?? `+ ${restCount} more`}
          </button>
        )}
      </div>

      <ul className="mt-2 space-y-1.5">
        {(expanded ? grouped : preview).map((w) => (
          <li key={w.id}>
            <button
              type="button"
              onClick={() => w.date && onFocusDay?.(w.date)}
              className="flex w-full items-start gap-2 rounded border border-amber-100 bg-amber-50/70 px-2 py-1.5 text-start text-xs text-amber-950 hover:bg-amber-100/80"
            >
              <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted">
                {t(GROUP_LABEL_KEYS[w.group])}
              </span>
              <span className="min-w-0 flex-1">
                {w.date ? `${formatDate(w.date)} · ` : ''}
                {w.message}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {expanded && coverageSummaries.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {showAll
              ? (t('schedule.warnings.hideDetails') as string) || 'Hide details'
              : (t('schedule.warnings.showDetails') as string) || 'Show grouped details'}
          </button>
          {showAll && (
            <ul className="mt-2 space-y-2">
              {coverageSummaries.map((s) => (
                <li key={s.key} className="rounded border border-border bg-surface-subtle px-2 py-1.5 text-xs">
                  <div className="font-medium text-foreground">
                    {t(s.label) !== s.label ? t(s.label) : s.label}
                  </div>
                  <div className="mt-0.5 text-muted">
                    {s.dates.map(formatDate).join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 text-xs text-muted hover:text-foreground"
        >
          {t('schedule.warnings.collapse') ?? 'Collapse'}
        </button>
      )}
    </div>
  );
}
