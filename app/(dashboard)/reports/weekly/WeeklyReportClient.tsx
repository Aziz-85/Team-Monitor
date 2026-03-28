'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { formatSarInt } from '@/lib/utils/money';
import { addDays, formatDateRiyadh, getRiyadhNow, getWeekRangeForDate, normalizeDateOnlyRiyadh } from '@/lib/time';

type BoutiqueBlock = {
  target: number;
  achieved: number;
  remaining: number;
  exceeded: number;
  percent: number;
};

type EmployeeRow = {
  userId: string;
  name: string;
  target: number;
  achieved: number;
  remaining: number;
  exceeded: number;
  percent: number;
  sharePercent: number;
};

type DayRow = {
  date: string;
  target: number;
  achieved: number;
  remaining: number;
  percent: number;
};

type Insights = {
  bestPerformer: { userId: string; name: string; achieved: number } | null;
  lowestPerformer: { userId: string; name: string; achieved: number } | null;
  highestSalesDay: { date: string; achieved: number } | null;
  weakestDay: { date: string; achieved: number } | null;
};

type ReportJson = {
  error?: string;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  boutiqueId: string;
  boutiqueName?: string;
  boutique: BoutiqueBlock;
  employees: EmployeeRow[];
  days: DayRow[];
  insights: Insights;
};

function defaultSaturday(): string {
  const { startSat } = getWeekRangeForDate(getRiyadhNow());
  return formatDateRiyadh(startSat);
}

function shiftWeekSaturday(currentSaturdayYmd: string, deltaWeeks: number): string {
  const base = normalizeDateOnlyRiyadh(currentSaturdayYmd);
  return formatDateRiyadh(addDays(base, deltaWeeks * 7));
}

export function WeeklyReportClient({ initialWeekStart }: { initialWeekStart?: string }) {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [weekStart, setWeekStart] = useState(() =>
    initialWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(initialWeekStart) ? initialWeekStart : defaultSaturday()
  );
  const [data, setData] = useState<ReportJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUrl = useCallback(
    (ws: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set('weekStart', ws);
      router.replace(`/reports/weekly?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (initialWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(initialWeekStart)) {
      setWeekStart(initialWeekStart);
    }
  }, [initialWeekStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/reports/weekly?weekStart=${encodeURIComponent(weekStart)}`)
      .then(async (r) => {
        const j = (await r.json()) as ReportJson & { error?: string };
        if (!r.ok) throw new Error(j.error ?? t('weeklyReport.loadError'));
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, t]);

  const goWeek = (delta: number) => {
    const next = shiftWeekSaturday(weekStart, delta);
    setWeekStart(next);
    syncUrl(next);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground md:text-2xl">{t('weeklyReport.title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('weeklyReport.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goWeek(-1)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-subtle"
            >
              {t('common.prev')}
            </button>
            <button
              type="button"
              onClick={() => {
                const d = defaultSaturday();
                setWeekStart(d);
                syncUrl(d);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-subtle"
            >
              {t('weeklyReport.thisWeek')}
            </button>
            <button
              type="button"
              onClick={() => goWeek(1)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-subtle"
            >
              {t('common.next')}
            </button>
          </div>
        </div>

        {loading && <p className="text-sm text-muted">{t('common.loading')}</p>}
        {error && <p className="text-sm text-rose-700">{error}</p>}

        {data && !loading && (
          <div className="mt-4 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted">{t('weeklyReport.weekNumber')}: </span>
              <span className="font-semibold tabular-nums">{data.weekNumber}</span>
            </div>
            <div>
              <span className="text-muted">{t('weeklyReport.range')}: </span>
              <span className="font-medium tabular-nums">
                {data.weekStart} → {data.weekEnd}
              </span>
            </div>
            <div>
              <span className="text-muted">{t('weeklyReport.boutique')}: </span>
              <span className="font-medium">{data.boutiqueName ?? data.boutiqueId}</span>
            </div>
          </div>
        )}
      </header>

      {data && !loading && (
        <>
          {data.insights && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InsightCard
                label={t('weeklyReport.insightBest')}
                value={
                  data.insights.bestPerformer
                    ? `${data.insights.bestPerformer.name} · ${formatSarInt(data.insights.bestPerformer.achieved)}`
                    : '—'
                }
              />
              <InsightCard
                label={t('weeklyReport.insightLowest')}
                value={
                  data.insights.lowestPerformer
                    ? `${data.insights.lowestPerformer.name} · ${formatSarInt(data.insights.lowestPerformer.achieved)}`
                    : '—'
                }
              />
              <InsightCard
                label={t('weeklyReport.insightBestDay')}
                value={
                  data.insights.highestSalesDay
                    ? `${data.insights.highestSalesDay.date} · ${formatSarInt(data.insights.highestSalesDay.achieved)}`
                    : '—'
                }
              />
              <InsightCard
                label={t('weeklyReport.insightWeakestDay')}
                value={
                  data.insights.weakestDay
                    ? `${data.insights.weakestDay.date} · ${formatSarInt(data.insights.weakestDay.achieved)}`
                    : '—'
                }
              />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              {t('weeklyReport.boutiqueSummary')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryCard label={t('weeklyReport.target')} value={formatSarInt(data.boutique.target)} />
              <SummaryCard label={t('weeklyReport.achieved')} value={formatSarInt(data.boutique.achieved)} />
              <SummaryCard label={t('weeklyReport.remaining')} value={formatSarInt(data.boutique.remaining)} />
              <SummaryCard label={t('weeklyReport.exceeded')} value={formatSarInt(data.boutique.exceeded)} />
              <SummaryCard label={t('weeklyReport.percent')} value={`${data.boutique.percent}%`} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              {t('weeklyReport.employees')}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] border-collapse text-start text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle">
                    <th className="p-2 font-medium">{t('common.name')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.target')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.achieved')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.remaining')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.exceeded')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.percent')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.sharePercent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((e) => (
                    <tr key={e.userId} className="border-b border-border">
                      <td className="p-2 font-medium">{e.name}</td>
                      <td className="p-2 tabular-nums">{formatSarInt(e.target)}</td>
                      <td className="p-2 tabular-nums">{formatSarInt(e.achieved)}</td>
                      <td className="p-2 tabular-nums">{formatSarInt(e.remaining)}</td>
                      <td className="p-2 tabular-nums">{formatSarInt(e.exceeded)}</td>
                      <td className="p-2 tabular-nums">{e.percent}%</td>
                      <td className="p-2 tabular-nums">{e.sharePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              {t('weeklyReport.dailyBreakdown')}
            </h2>
            <p className="mb-3 text-xs text-muted">{t('weeklyReport.dailyNote')}</p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] border-collapse text-start text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle">
                    <th className="p-2 font-medium">{t('common.date')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.dailyTarget')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.achieved')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.remaining')}</th>
                    <th className="p-2 font-medium">{t('weeklyReport.percent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.date} className="border-b border-border">
                      <td className="p-2 font-mono text-xs">{d.date}</td>
                      <td className="p-2 tabular-nums">{formatSarInt(d.target)}</td>
                      <td className="p-2 tabular-nums">{formatSarInt(d.achieved)}</td>
                      <td className="p-2 tabular-nums">{formatSarInt(d.remaining)}</td>
                      <td className="p-2 tabular-nums">{d.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function InsightCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/80 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
