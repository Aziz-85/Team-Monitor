'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import {
  addDays,
  formatDateRiyadh,
  getRiyadhNow,
  getWeekRangeForDate,
  normalizeDateOnlyRiyadh,
} from '@/lib/time';

export type ExportBoutique = {
  id: string;
  code: string;
  name: string;
  label: string;
};

type ExportCategory = 'schedule' | 'sales' | 'tasks';

type ExportCenterClientProps = {
  initialCategory?: ExportCategory;
  initialWeekStart?: string;
  defaultBoutiqueId: string;
  boutiques: ExportBoutique[];
  canSelectAll: boolean;
  canExportAudit: boolean;
  canExportSales: boolean;
  canExportTasks: boolean;
};

function defaultWeekStart(): string {
  const { startSat } = getWeekRangeForDate(getRiyadhNow());
  return formatDateRiyadh(startSat);
}

function defaultEndDate(start: string): string {
  return formatDateRiyadh(addDays(normalizeDateOnlyRiyadh(start), 6));
}

export function ExportCenterClient({
  initialCategory,
  initialWeekStart,
  defaultBoutiqueId,
  boutiques,
  canSelectAll,
  canExportAudit,
  canExportSales,
  canExportTasks,
}: ExportCenterClientProps) {
  const { t } = useT();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState<ExportCategory>(() => {
    const p = searchParams.get('category') ?? initialCategory;
    if (p === 'sales' && canExportSales) return 'sales';
    if (p === 'tasks' && canExportTasks) return 'tasks';
    return 'schedule';
  });

  const weekStart =
    initialWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(initialWeekStart)
      ? initialWeekStart
      : defaultWeekStart();

  const [startDate, setStartDate] = useState(weekStart);
  const [endDate, setEndDate] = useState(() => defaultEndDate(weekStart));
  const [boutiqueId, setBoutiqueId] = useState(
    () => defaultBoutiqueId || boutiques[0]?.id || 'current'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [includeEmployeeSchedule, setIncludeEmployeeSchedule] = useState(true);
  const [includeExternalCoverage, setIncludeExternalCoverage] = useState(true);
  const [includeCoverageCounts, setIncludeCoverageCounts] = useState(true);
  const [includeAudit, setIncludeAudit] = useState(canExportAudit);
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [includeSplitShifts, setIncludeSplitShifts] = useState(true);

  const [includeSalesSummary, setIncludeSalesSummary] = useState(true);
  const [includeDailySales, setIncludeDailySales] = useState(true);
  const [includeEmployeeSales, setIncludeEmployeeSales] = useState(true);
  const [includeBoutiqueSales, setIncludeBoutiqueSales] = useState(true);
  const [includeDiscounts, setIncludeDiscounts] = useState(true);
  const [includePaymentDetails, setIncludePaymentDetails] = useState(true);

  const [includeTaskSummary, setIncludeTaskSummary] = useState(true);
  const [includeTaskList, setIncludeTaskList] = useState(true);
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeEmployeePerformance, setIncludeEmployeePerformance] = useState(true);

  const boutiqueOptions = useMemo(() => {
    const opts = boutiques.map((b) => ({ value: b.id, label: b.label }));
    if (canSelectAll) {
      return [{ value: 'all', label: t('exportCenter.allBoutiques') }, ...opts];
    }
    return opts;
  }, [boutiques, canSelectAll, t]);

  const categories = useMemo(() => {
    const items: { id: ExportCategory; label: string }[] = [
      { id: 'schedule', label: t('exportCenter.categories.schedule') },
    ];
    if (canExportSales) items.push({ id: 'sales', label: t('exportCenter.categories.sales') });
    if (canExportTasks) items.push({ id: 'tasks', label: t('exportCenter.categories.tasks') });
    return items;
  }, [canExportSales, canExportTasks, t]);

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams();
    q.set('startDate', startDate);
    q.set('endDate', endDate);
    q.set('boutiqueId', boutiqueId);

    if (category === 'schedule') {
      q.set('includeEmployeeSchedule', String(includeEmployeeSchedule));
      q.set('includeExternalCoverage', String(includeExternalCoverage));
      q.set('includeCoverageCounts', String(includeCoverageCounts));
      q.set('includeAudit', String(includeAudit && canExportAudit));
      q.set('includeWarnings', String(includeWarnings));
      q.set('includeSplitShifts', String(includeSplitShifts));
    } else if (category === 'sales') {
      q.set('includeSummary', String(includeSalesSummary));
      q.set('includeDaily', String(includeDailySales));
      q.set('includeEmployee', String(includeEmployeeSales));
      q.set('includeBoutique', String(includeBoutiqueSales));
      q.set('includeDiscounts', String(includeDiscounts));
      q.set('includePaymentDetails', String(includePaymentDetails));
    } else {
      q.set('includeSummary', String(includeTaskSummary));
      q.set('includeTaskList', String(includeTaskList));
      q.set('includeOverdue', String(includeOverdue));
      q.set('includeCompleted', String(includeCompleted));
      q.set('includeEmployeePerformance', String(includeEmployeePerformance));
    }
    return q;
  }, [
    category,
    startDate,
    endDate,
    boutiqueId,
    includeEmployeeSchedule,
    includeExternalCoverage,
    includeCoverageCounts,
    includeAudit,
    includeWarnings,
    includeSplitShifts,
    canExportAudit,
    includeSalesSummary,
    includeDailySales,
    includeEmployeeSales,
    includeBoutiqueSales,
    includeDiscounts,
    includePaymentDetails,
    includeTaskSummary,
    includeTaskList,
    includeOverdue,
    includeCompleted,
    includeEmployeePerformance,
  ]);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiPath = `/api/reports/export/${category}?${buildQuery().toString()}`;
      const res = await fetch(apiPath, { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error as string) || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${category}-export.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('exportCenter.exportFailed'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent';

  const checkbox = (
    id: string,
    label: string,
    checked: boolean,
    set: (v: boolean) => void
  ) => (
    <label key={id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => set(e.target.checked)}
        className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
      />
      {label}
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('exportCenter.title')}</h1>
        <p className="text-sm text-muted">{t('exportCenter.subtitle')}</p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              category === c.id
                ? 'border-accent bg-accent/10 text-foreground'
                : 'border-border bg-surface-subtle text-muted hover:text-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">{t('exportCenter.startDate')}</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">{t('exportCenter.endDate')}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">{t('exportCenter.boutique')}</span>
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
          <legend className="text-sm font-medium text-foreground">
            {t('exportCenter.includeSections')}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {category === 'schedule' && (
              <>
                {checkbox('se', t('exportCenter.schedule.employeeSchedule'), includeEmployeeSchedule, setIncludeEmployeeSchedule)}
                {checkbox('sec', t('exportCenter.schedule.externalCoverage'), includeExternalCoverage, setIncludeExternalCoverage)}
                {checkbox('sc', t('exportCenter.schedule.coverageCounts'), includeCoverageCounts, setIncludeCoverageCounts)}
                {canExportAudit &&
                  checkbox('sa', t('exportCenter.schedule.audit'), includeAudit, setIncludeAudit)}
                {checkbox('sw', t('exportCenter.schedule.warnings'), includeWarnings, setIncludeWarnings)}
                {checkbox('ss', t('exportCenter.schedule.splitShifts'), includeSplitShifts, setIncludeSplitShifts)}
              </>
            )}
            {category === 'sales' && (
              <>
                {checkbox('ssu', t('exportCenter.sales.summary'), includeSalesSummary, setIncludeSalesSummary)}
                {checkbox('sd', t('exportCenter.sales.daily'), includeDailySales, setIncludeDailySales)}
                {checkbox('semp', t('exportCenter.sales.employee'), includeEmployeeSales, setIncludeEmployeeSales)}
                {checkbox('sb', t('exportCenter.sales.boutique'), includeBoutiqueSales, setIncludeBoutiqueSales)}
                {checkbox('sdis', t('exportCenter.sales.discounts'), includeDiscounts, setIncludeDiscounts)}
                {checkbox('spay', t('exportCenter.sales.paymentDetails'), includePaymentDetails, setIncludePaymentDetails)}
              </>
            )}
            {category === 'tasks' && (
              <>
                {checkbox('ts', t('exportCenter.tasks.summary'), includeTaskSummary, setIncludeTaskSummary)}
                {checkbox('tl', t('exportCenter.tasks.list'), includeTaskList, setIncludeTaskList)}
                {checkbox('to', t('exportCenter.tasks.overdue'), includeOverdue, setIncludeOverdue)}
                {checkbox('tc', t('exportCenter.tasks.completed'), includeCompleted, setIncludeCompleted)}
                {checkbox('tp', t('exportCenter.tasks.performance'), includeEmployeePerformance, setIncludeEmployeePerformance)}
              </>
            )}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? t('exportCenter.exporting') : t('exportCenter.exportButton')}
          </button>
          <span className="text-xs text-muted">{t('exportCenter.formatHint')}</span>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </section>
    </div>
  );
}
