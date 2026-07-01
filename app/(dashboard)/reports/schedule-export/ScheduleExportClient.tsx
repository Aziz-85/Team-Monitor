'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { addDays, formatDateRiyadh, getRiyadhNow, getWeekRangeForDate, normalizeDateOnlyRiyadh } from '@/lib/time';

export type ScheduleExportBoutique = {
  id: string;
  code: string;
  name: string;
  label: string;
};

type ExportType = 'week' | 'range' | 'month';

type ScheduleExportClientProps = {
  initialWeekStart?: string;
  defaultBoutiqueId: string;
  boutiques: ScheduleExportBoutique[];
  canSelectAll: boolean;
  canExportAudit: boolean;
};

function defaultSaturday(): string {
  const { startSat } = getWeekRangeForDate(getRiyadhNow());
  return formatDateRiyadh(startSat);
}

function weekStartSaturday(dateYmd: string): string {
  const d = new Date(dateYmd + 'T12:00:00Z');
  const { startSat } = getWeekRangeForDate(d);
  return formatDateRiyadh(startSat);
}

function currentMonth(): string {
  const now = getRiyadhNow();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function ScheduleExportClient({
  initialWeekStart,
  defaultBoutiqueId,
  boutiques,
  canSelectAll,
  canExportAudit,
}: ScheduleExportClientProps) {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [exportType, setExportType] = useState<ExportType>(() => {
    const p = searchParams.get('type');
    return p === 'range' || p === 'month' ? p : 'week';
  });
  const [weekStart, setWeekStart] = useState(() =>
    initialWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(initialWeekStart)
      ? weekStartSaturday(initialWeekStart)
      : defaultSaturday()
  );
  const [startDate, setStartDate] = useState(() => weekStart);
  const [endDate, setEndDate] = useState(() =>
    formatDateRiyadh(addDays(normalizeDateOnlyRiyadh(weekStart), 6))
  );
  const [month, setMonth] = useState(currentMonth);
  const [boutiqueId, setBoutiqueId] = useState(() => defaultBoutiqueId || boutiques[0]?.id || 'current');
  const [includeEmployeeSchedule, setIncludeEmployeeSchedule] = useState(true);
  const [includeExternalCoverage, setIncludeExternalCoverage] = useState(true);
  const [includeCoverageCounts, setIncludeCoverageCounts] = useState(true);
  const [includeAudit, setIncludeAudit] = useState(canExportAudit);
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [includeSplitShifts, setIncludeSplitShifts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boutiqueOptions = useMemo(() => {
    const opts = boutiques.map((b) => ({ value: b.id, label: b.label }));
    if (canSelectAll) {
      return [{ value: 'all', label: t('scheduleExport.allBoutiques') }, ...opts];
    }
    return opts;
  }, [boutiques, canSelectAll, t]);

  const syncUrl = useCallback(
    (ws: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set('weekStart', ws);
      router.replace(`/reports/schedule-export?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleWeekStartChange = (value: string) => {
    const ws = weekStartSaturday(value);
    setWeekStart(ws);
    setStartDate(ws);
    setEndDate(formatDateRiyadh(addDays(normalizeDateOnlyRiyadh(ws), 6)));
    syncUrl(ws);
  };

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams();
    q.set('type', exportType);
    if (exportType === 'week') q.set('weekStart', weekStart);
    if (exportType === 'range') {
      q.set('startDate', startDate);
      q.set('endDate', endDate);
    }
    if (exportType === 'month') q.set('month', month);
    q.set('boutiqueId', boutiqueId);
    q.set('includeEmployeeSchedule', String(includeEmployeeSchedule));
    q.set('includeExternalCoverage', String(includeExternalCoverage));
    q.set('includeCoverageCounts', String(includeCoverageCounts));
    q.set('includeAudit', String(includeAudit && canExportAudit));
    q.set('includeWarnings', String(includeWarnings));
    q.set('includeSplitShifts', String(includeSplitShifts));
    return q;
  }, [
    exportType,
    weekStart,
    startDate,
    endDate,
    month,
    boutiqueId,
    includeEmployeeSchedule,
    includeExternalCoverage,
    includeCoverageCounts,
    includeAudit,
    includeWarnings,
    includeSplitShifts,
    canExportAudit,
  ]);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/schedule-export?${buildQuery().toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error as string) || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'schedule-export.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('scheduleExport.exportFailed'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('scheduleExport.title')}</h1>
        <p className="text-sm text-muted">{t('scheduleExport.subtitle')}</p>
      </header>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-5">
        <div>
          <span className="mb-2 block text-sm font-medium text-foreground">
            {t('scheduleExport.exportType')}
          </span>
          <div className="flex flex-wrap gap-2">
            {(['week', 'range', 'month'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setExportType(type)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  exportType === type
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-border bg-surface-subtle text-muted hover:text-foreground'
                }`}
              >
                {t(`scheduleExport.type.${type}`)}
              </button>
            ))}
          </div>
        </div>

        {exportType === 'week' && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">{t('scheduleExport.weekStart')}</span>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => handleWeekStartChange(e.target.value)}
              className={inputClass}
            />
          </label>
        )}

        {exportType === 'range' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">{t('scheduleExport.startDate')}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">{t('scheduleExport.endDate')}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        )}

        {exportType === 'month' && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">{t('scheduleExport.month')}</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={inputClass}
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">{t('scheduleExport.boutique')}</span>
          <select
            value={boutiqueId}
            onChange={(e) => setBoutiqueId(e.target.value)}
            className={inputClass}
            disabled={boutiqueOptions.length <= 1 && !canSelectAll}
          >
            {boutiqueOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">{t('scheduleExport.includeSections')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { id: 'emp', label: t('scheduleExport.include.employeeSchedule'), checked: includeEmployeeSchedule, set: setIncludeEmployeeSchedule },
              { id: 'ext', label: t('scheduleExport.include.externalCoverage'), checked: includeExternalCoverage, set: setIncludeExternalCoverage },
              { id: 'cov', label: t('scheduleExport.include.coverageCounts'), checked: includeCoverageCounts, set: setIncludeCoverageCounts },
              ...(canExportAudit
                ? [{ id: 'aud', label: t('scheduleExport.include.audit'), checked: includeAudit, set: setIncludeAudit }]
                : []),
              { id: 'warn', label: t('scheduleExport.include.warnings'), checked: includeWarnings, set: setIncludeWarnings },
              { id: 'split', label: t('scheduleExport.include.splitShifts'), checked: includeSplitShifts, set: setIncludeSplitShifts },
            ].map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? t('scheduleExport.exporting') : t('scheduleExport.exportButton')}
          </button>
          <span className="text-xs text-muted">{t('scheduleExport.formatHint')}</span>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </section>
    </div>
  );
}
