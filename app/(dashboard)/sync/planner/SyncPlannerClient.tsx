'use client';

import { useState, useMemo } from 'react';
import { useI18n } from '@/app/providers';
import { getWeekNumber, getWeekStartSaturday, getWeekEndFriday } from '@/lib/utils/week';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type CompareRow = {
  taskKey: string | null;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  siteStatus: string;
  plannerStatus: string;
  matchStatus: string;
  flags?: Record<string, unknown>;
};

type CompareResult = {
  matched: CompareRow[];
  plannerDoneApply: CompareRow[];
  siteDoneOnly: CompareRow[];
  conflicts: CompareRow[];
  missingKey: CompareRow[];
  suspicious: CompareRow[];
};

const TABS = [
  { key: 'matched', labelKey: 'sync.resultsMatched', getRows: (r: CompareResult) => r.matched },
  { key: 'plannerDone', labelKey: 'sync.resultsPlannerDone', getRows: (r: CompareResult) => r.plannerDoneApply },
  { key: 'siteDone', labelKey: 'sync.resultsSiteDone', getRows: (r: CompareResult) => r.siteDoneOnly },
  { key: 'conflicts', labelKey: 'sync.resultsConflicts', getRows: (r: CompareResult) => r.conflicts },
  { key: 'missingKey', labelKey: 'sync.resultsMissingKey', getRows: (r: CompareResult) => r.missingKey },
  { key: 'suspicious', labelKey: 'sync.resultsSuspicious', getRows: (r: CompareResult) => r.suspicious },
] as const;

export function SyncPlannerClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const [periodType, setPeriodType] = useState<'WEEK' | 'MONTH'>('WEEK');
  const [referenceDate, setReferenceDate] = useState<string>('');
  const [plannerFile, setPlannerFile] = useState<File | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyDone, setApplyDone] = useState<{ applied: number } | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { generatedKey, weekRange } = useMemo(() => {
    if (!referenceDate.trim()) {
      return { generatedKey: '', weekRange: null as { start: string; end: string } | null };
    }
    const d = new Date(referenceDate + 'T12:00:00');
    if (Number.isNaN(d.getTime())) {
      return { generatedKey: '', weekRange: null };
    }
    if (periodType === 'WEEK') {
      const weekNum = getWeekNumber(d);
      const year = d.getFullYear();
      const key = `${year}-W${String(weekNum).padStart(2, '0')}`;
      const sat = getWeekStartSaturday(d);
      const fri = getWeekEndFriday(d);
      const fmt = (date: Date) =>
        date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
      return {
        generatedKey: key,
        weekRange: { start: fmt(sat), end: fmt(fri) },
      };
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return {
      generatedKey: `${year}-${month}`,
      weekRange: null,
    };
  }, [referenceDate, periodType]);

  const handleExport = async () => {
    if (!generatedKey) {
      setError('Select a reference date to generate period key');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // WEEK: use v2 (Planner / Power Automate–friendly CSV). MONTH: use legacy export.
      const isV2 = periodType === 'WEEK';
      const url = isV2
        ? `/api/sync/planner/export/v2?periodType=WEEK&periodKey=${encodeURIComponent(generatedKey)}`
        : `/api/sync/planner/export?periodType=${periodType}&periodKey=${encodeURIComponent(generatedKey)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = isV2 ? `planner-export-${generatedKey}.csv` : `site-export-${generatedKey}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleExportLegacy = async () => {
    if (!generatedKey) {
      setError('Select a reference date to generate period key');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const url = `/api/sync/planner/export?periodType=${periodType}&periodKey=${encodeURIComponent(generatedKey)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `site-export-${generatedKey}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setPlannerFile(f ?? null);
    setCompareResult(null);
    setApplyDone(null);
  };

  const handleCompare = async () => {
    if (!generatedKey || !plannerFile) {
      setError('Select a reference date and upload a Planner file');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append('periodType', periodType);
      form.append('periodKey', generatedKey);
      form.append('plannerFile', plannerFile);
      const res = await fetch('/api/sync/planner/compare', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      setCompareResult(data.compare);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!generatedKey || !plannerFile) {
      setError('Select a reference date and upload a Planner file');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append('periodType', periodType);
      form.append('periodKey', generatedKey);
      form.append('plannerFile', plannerFile);
      const res = await fetch('/api/sync/planner/apply', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      setApplyDone({ applied: data.applied ?? 0 });
      if (data.compare) setCompareResult(data.compare);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const currentRows = compareResult ? TABS[activeTab].getRows(compareResult) : [];

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-xl font-semibold text-slate-800">{t('sync.plannerSyncTitle')}</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {applyDone && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {t('sync.auditSaved')}. {t('sync.appliedCount').replace('{n}', String(applyDone.applied))}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('sync.period')}</h2>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={periodType === 'WEEK'}
                onChange={() => setPeriodType('WEEK')}
                className="rounded border-slate-300"
              />
              <span className="text-sm">{t('sync.periodWeek')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={periodType === 'MONTH'}
                onChange={() => setPeriodType('MONTH')}
                className="rounded border-slate-300"
              />
              <span className="text-sm">{t('sync.periodMonth')}</span>
            </label>
          </div>
          <div className="mt-3 space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t('sync.referenceDate')}
              </label>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            {generatedKey && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t('sync.generatedKey')}
                  </label>
                  <span
                    className="inline-block rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-sm text-slate-800"
                    aria-readonly
                  >
                    {generatedKey}
                  </span>
                </div>
                {periodType === 'WEEK' && weekRange && (
                  <div className="text-sm text-slate-600">
                    {t('sync.weekLabel')}: {weekRange.start} – {weekRange.end}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('sync.exportSiteTitle')}</h2>
          <p className="mb-3 text-xs text-slate-600">{t('sync.exportSiteHint')}</p>
          <p className="mb-1 text-xs text-slate-500">
            {periodType === 'WEEK' ? t('sync.exportFormatV2Hint') : t('sync.exportFormatMonthHint')}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={loading || !generatedKey}
              className="w-fit rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('sync.downloadCsv')}
            </button>
            <button
              type="button"
              onClick={handleExportLegacy}
              disabled={loading || !generatedKey}
              className="w-fit rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('sync.downloadLegacy')}
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('sync.uploadPlannerTitle')}</h2>
          <p className="mb-2 text-xs text-slate-600">{t('sync.uploadPlannerHint')}</p>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileChange}
            className="block w-full max-w-md text-sm text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
          />
          <button
            type="button"
            onClick={handleCompare}
            disabled={loading || !generatedKey || !plannerFile}
            className="mt-3 rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('sync.compare')}
          </button>
        </section>

        {compareResult && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {TABS.map((tab, i) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`rounded px-2 py-1 text-sm ${activeTab === i ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}
                >
                  {t(tab.labelKey)} ({tab.getRows(compareResult).length})
                </button>
              ))}
            </div>
            {compareResult.plannerDoneApply.length > 0 && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={loading}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {t('sync.apply')}
                </button>
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {currentRows.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">{t('tasks.emptyList')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                        <th className="px-2 py-2 text-xs font-semibold">{t('sync.matchStatus')}</th>
                        <th className="px-2 py-2 text-xs font-semibold">taskKey</th>
                        <th className="px-2 py-2 text-xs font-semibold">{t('tasks.colTitle')}</th>
                        <th className="px-2 py-2 text-xs font-semibold">{t('tasks.assignedTo')}</th>
                        <th className="px-2 py-2 text-xs font-semibold">{t('tasks.due')}</th>
                        <th className="px-2 py-2 text-xs font-semibold">Site</th>
                        <th className="px-2 py-2 text-xs font-semibold">Planner</th>
                        <th className="px-2 py-2 text-xs font-semibold">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="px-2 py-2 text-slate-600">{row.matchStatus}</td>
                          <td className="px-2 py-2 font-mono text-xs">{row.taskKey ?? '—'}</td>
                          <td className="max-w-[180px] truncate px-2 py-2" title={row.title}>{row.title}</td>
                          <td className="px-2 py-2">{row.assignee ?? '—'}</td>
                          <td className="px-2 py-2">{row.dueDate ?? '—'}</td>
                          <td className="px-2 py-2">{row.siteStatus}</td>
                          <td className="px-2 py-2">{row.plannerStatus}</td>
                          <td className="px-2 py-2 text-xs">
                            {row.flags ? (
                              <span className="rounded bg-amber-100 px-1 text-amber-800">{t('sync.flagReviewNeeded')}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
