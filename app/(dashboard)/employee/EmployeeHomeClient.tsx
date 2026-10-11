'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { formatSarInt } from '@/lib/utils/money';
import { PaceCard } from '@/components/analytics/PaceCard';
import { ForecastCard } from '@/components/analytics/ForecastCard';
import type { ForecastMetrics, PaceMetrics } from '@/lib/analytics/performanceLayer';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import {
  EmptyStateBlock,
  KPIGrid,
  KPIStatCard,
  PageContainer,
  RecommendationCard,
  SectionBlock,
} from '@/components/ui/ExecutiveIntelligence';

type EmployeeHomeData = {
  date: string;
  todaySchedule: { am: boolean; pm: boolean };
  weekRoster: { am: Array<{ empId: string; name: string }>; pm: Array<{ empId: string; name: string }> };
  todayTasks: Array<{ taskName: string; reason: string }>;
};

export function EmployeeHomeClient() {
  const { t } = useT();
  const [data, setData] = useState<EmployeeHomeData | null>(null);
  const [date, setDate] = useState(() => getRiyadhDateKey());
  const [targetsData, setTargetsData] = useState<{
    todayTarget: number;
    todaySales: number;
    todayPct: number;
    monthlyTarget: number;
    mtdSales: number;
    mtdPct: number;
    remaining: number;
    reportingDailyAllocationSar?: number;
    remainingMonthTargetSar?: number;
    dailyAchievementPending?: boolean;
    monthlyTargetMet?: boolean;
  } | null>(null);

  const [salesEntryDate, setSalesEntryDate] = useState(() => getRiyadhDateKey());
  const [salesEntryAmount, setSalesEntryAmount] = useState<string>('');
  const [salesEntryInvoiceCount, setSalesEntryInvoiceCount] = useState<string>('');
  const [salesEntryPieceCount, setSalesEntryPieceCount] = useState<string>('');
  const [salesEntrySaving, setSalesEntrySaving] = useState(false);
  const [salesEntryError, setSalesEntryError] = useState<string | null>(null);
  const [salesEntryInfo, setSalesEntryInfo] = useState<string | null>(null);
  const [lastEntries, setLastEntries] = useState<
    Array<{ id: string; date: string; amount: number; invoiceCount?: number | null; pieceCount?: number | null }>
  >([]);
  const [selfAnalytics, setSelfAnalytics] = useState<{
    employees?: Array<{ pace: PaceMetrics; forecast: ForecastMetrics }>;
  } | null>(null);

  const fetchLastEntries = useCallback(() => {
    fetch('/api/me/sales?days=7')
      .then((r) => r.json())
      .then(
        (j: {
          entries?: Array<{
            id: string;
            date: string;
            amount: number;
            invoiceCount?: number | null;
            pieceCount?: number | null;
          }>;
        }) => {
          setLastEntries(j.entries ?? []);
        }
      )
      .catch(() => setLastEntries([]));
  }, []);

  useEffect(() => {
    fetchLastEntries();
  }, [fetchLastEntries]);

  const saveSalesEntry = async () => {
    const amount = Number(salesEntryAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      setSalesEntryError('Enter a whole number ≥ 0');
      return;
    }
    const invTrim = salesEntryInvoiceCount.trim();
    const pcTrim = salesEntryPieceCount.trim();
    if (invTrim !== '') {
      const v = Number(invTrim);
      if (!Number.isInteger(v) || v < 0) {
        setSalesEntryError('Invoices must be a whole number ≥ 0');
        return;
      }
    }
    if (pcTrim !== '') {
      const v = Number(pcTrim);
      if (!Number.isInteger(v) || v < 0) {
        setSalesEntryError('Pieces must be a whole number ≥ 0');
        return;
      }
    }
    setSalesEntryError(null);
    setSalesEntryInfo(null);
    setSalesEntrySaving(true);
    try {
      const body: {
        date: string;
        salesSar: number;
        invoiceCount?: number;
        pieceCount?: number;
      } = { date: salesEntryDate, salesSar: amount };
      if (invTrim !== '') body.invoiceCount = Number(invTrim);
      if (pcTrim !== '') body.pieceCount = Number(pcTrim);
      const res = await fetch('/api/sales/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setSalesEntryError(j.error ?? 'Save failed');
        return;
      }
      setSalesEntryInfo(typeof j.metricsNote === 'string' && j.metricsNote ? j.metricsNote : null);
      setSalesEntryAmount('');
      setSalesEntryInvoiceCount('');
      setSalesEntryPieceCount('');
      fetchLastEntries();
      fetch('/api/me/targets')
        .then((r) => r.json())
        .then(
          (d: {
            todayTarget?: number;
            todaySales?: number;
            todayPct?: number;
            monthlyTarget?: number;
            mtdSales?: number;
            mtdPct?: number;
            remaining?: number;
            reportingDailyAllocationSar?: number;
            remainingMonthTargetSar?: number;
            dailyAchievementPending?: boolean;
            monthlyTargetMet?: boolean;
          }) => {
            if (d && typeof d.todayTarget === 'number') {
              setTargetsData({
                todayTarget: d.todayTarget ?? 0,
                todaySales: d.todaySales ?? 0,
                todayPct: d.todayPct ?? 0,
                monthlyTarget: d.monthlyTarget ?? 0,
                mtdSales: d.mtdSales ?? 0,
                mtdPct: d.mtdPct ?? 0,
                remaining: d.remaining ?? 0,
                reportingDailyAllocationSar: d.reportingDailyAllocationSar,
                remainingMonthTargetSar: d.remainingMonthTargetSar,
                dailyAchievementPending: d.dailyAchievementPending === true,
                monthlyTargetMet: d.monthlyTargetMet === true,
              });
            }
          }
        )
        .catch(() => {});
    } finally {
      setSalesEntrySaving(false);
    }
  };

  useEffect(() => {
    fetch('/api/me/targets')
      .then((r) => r.json())
      .then(
        (d: {
          todayTarget?: number;
          todaySales?: number;
          todayPct?: number;
          monthlyTarget?: number;
          mtdSales?: number;
          mtdPct?: number;
          remaining?: number;
          reportingDailyAllocationSar?: number;
          remainingMonthTargetSar?: number;
          dailyAchievementPending?: boolean;
          monthlyTargetMet?: boolean;
        }) => {
        if (d && typeof d.todayTarget === 'number') {
          setTargetsData({
            todayTarget: d.todayTarget ?? 0,
            todaySales: d.todaySales ?? 0,
            todayPct: d.todayPct ?? 0,
            monthlyTarget: d.monthlyTarget ?? 0,
            mtdSales: d.mtdSales ?? 0,
            mtdPct: d.mtdPct ?? 0,
            remaining: d.remaining ?? 0,
            reportingDailyAllocationSar: d.reportingDailyAllocationSar,
            remainingMonthTargetSar: d.remainingMonthTargetSar,
            dailyAchievementPending: d.dailyAchievementPending === true,
            monthlyTargetMet: d.monthlyTargetMet === true,
          });
        }
      }
      )
      .catch(() => setTargetsData(null));
  }, []);

  useEffect(() => {
    fetch('/api/analytics/performance')
      .then((r) => (r.ok ? r.json() : null))
      .then(setSelfAnalytics)
      .catch(() => setSelfAnalytics(null));
  }, []);

  useEffect(() => {
    fetch(`/api/employee/home?date=${date}`)
      .then((r) => r.json().catch(() => null))
      .then(setData)
      .catch(() => setData(null));
  }, [date]);

  if (!data) {
    return (
      <div className="w-full min-w-0 max-w-full p-4">
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const monthlyRemaining = targetsData
    ? targetsData.remainingMonthTargetSar ?? Math.max(0, targetsData.monthlyTarget - targetsData.mtdSales)
    : 0;
  const paceTone = targetsData?.monthlyTargetMet
    ? 'success'
    : (targetsData?.mtdPct ?? 0) >= 90
      ? 'default'
      : (targetsData?.mtdPct ?? 0) >= 70
        ? 'warning'
        : 'danger';
  const inputClass =
    'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15';

  return (
    <PageContainer className="overflow-x-hidden space-y-8 md:space-y-10">
      <SectionBlock
        title={t('nav.employeeHome')}
        subtitle={t('home.targetsTodayOnlySubtitle')}
        rightSlot={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm">
            <label htmlFor="employee-home-date" className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t('common.date')}
            </label>
          <input
            id="employee-home-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-sm font-medium text-foreground outline-none"
          />
          </div>
        }
      >
        <RecommendationCard
          title={targetsData?.monthlyTargetMet ? t('home.monthlyTargetAchievedBadge') : t('home.monthlyProgressCard')}
          message={`${Math.round(targetsData?.mtdPct ?? 0)}% · ${t('targets.remainingMonthlyTarget')}: ${formatSarInt(monthlyRemaining)}`}
          tone={paceTone}
          className="border-2 p-5 md:p-6"
        />
      </SectionBlock>

      {targetsData != null && (targetsData.monthlyTarget > 0 || targetsData.todaySales > 0 || targetsData.mtdSales > 0) && (
        <SectionBlock title={t('home.monthlyProgressCard')} subtitle={t('home.targetsTodayOnlySubtitle')}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <KPIStatCard
              title={t('home.monthlyProgressCard')}
              value={`${Math.round(targetsData.mtdPct)}%`}
              subtitle={`${formatSarInt(targetsData.mtdSales)} / ${formatSarInt(targetsData.monthlyTarget)}`}
              tone={paceTone}
              emphasis="strong"
              trendLabel={targetsData.monthlyTargetMet ? t('home.monthlyTargetAchievedBadge') : undefined}
            />
            <KPIStatCard
              title={t('targets.remainingMonthlyTarget')}
              value={formatSarInt(monthlyRemaining)}
              subtitle={t('targets.dailyRequiredPace')}
              tone={monthlyRemaining > 0 ? 'warning' : 'success'}
              emphasis="strong"
            />
          </div>
          <KPIGrid cols={4} className="mt-3">
            <KPIStatCard title={t('home.sales')} value={formatSarInt(targetsData.todaySales)} subtitle={`${Math.round(targetsData.todayPct)}%`} tone={targetsData.todayPct >= 100 ? 'success' : 'default'} />
            <KPIStatCard title={t('home.dailyTargetCard')} value={formatSarInt(targetsData.todayTarget)} subtitle={targetsData.dailyAchievementPending ? t('targets.dailyAchievementPending') : t('targets.dailyRequiredPace')} tone="default" />
            <KPIStatCard title={t('targets.reportingDailyShort')} value={formatSarInt(targetsData.reportingDailyAllocationSar ?? 0)} tone="default" />
            <KPIStatCard title="MTD Sales" value={formatSarInt(targetsData.mtdSales)} tone={paceTone} />
          </KPIGrid>
        </SectionBlock>
      )}

      {selfAnalytics?.employees?.[0] && (
        <SectionBlock title={t('analytics.monthPaceTitle')} subtitle={t('analytics.projectionOnly')}>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <PaceCard
              title={t('analytics.monthPaceTitle')}
              pace={selfAnalytics.employees[0].pace}
              expectedLabel={t('analytics.expectedByToday')}
              actualMtdLabel={t('analytics.actualMtdPace')}
              deltaLabel={t('analytics.deltaVsExpected')}
              bandLabels={{
                ahead: t('analytics.ahead'),
                onTrack: t('analytics.onTrack'),
                behind: t('analytics.behind'),
              }}
            />
            <ForecastCard
              title={t('analytics.monthForecastTitle')}
              linear={selfAnalytics.employees[0].forecast}
              rolling7={null}
              disclaimer={t('analytics.projectionOnly')}
              rollingTitle={t('analytics.forecastRolling7')}
            />
          </div>
        </SectionBlock>
      )}

      <SectionBlock
        title="My Sales"
        subtitle="Enter today's sales and keep your monthly progress current. Zero is a valid entry."
        rightSlot={
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Daily entry
          </span>
        }
      >
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
          <div className="rounded-2xl border border-border bg-surface-subtle/50 p-4 md:p-5">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted">
                Date
                <input
                  type="date"
                  value={salesEntryDate}
                  onChange={(e) => setSalesEntryDate(e.target.value)}
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted">
                Amount (SAR)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={salesEntryAmount}
                  onChange={(e) => setSalesEntryAmount(e.target.value)}
                  placeholder="0"
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted">
                {t('home.salesInvoicesLabel')}
                <input
                  name="invoiceCount"
                  type="number"
                  min={0}
                  step={1}
                  value={salesEntryInvoiceCount}
                  onChange={(e) => setSalesEntryInvoiceCount(e.target.value)}
                  className={`${inputClass} mt-2`}
                  placeholder=""
                />
              </label>
              <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted">
                {t('home.salesPiecesLabel')}
                <input
                  name="pieceCount"
                  type="number"
                  min={0}
                  step={1}
                  value={salesEntryPieceCount}
                  onChange={(e) => setSalesEntryPieceCount(e.target.value)}
                  className={`${inputClass} mt-2`}
                  placeholder=""
                />
              </label>
            </div>
            <button
              type="button"
              disabled={salesEntrySaving}
              onClick={saveSalesEntry}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {salesEntrySaving ? 'Saving…' : 'Save sales entry'}
            </button>
            {salesEntryError && <p className="mt-3 text-sm font-medium text-rose-600">{salesEntryError}</p>}
            {salesEntryInfo && !salesEntryError && (
              <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-400">{salesEntryInfo}</p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Last 7 entries</p>
            {lastEntries.length === 0 ? (
              <EmptyStateBlock title="No recent entries" description="Your saved sales will appear here." className="mt-3 border-0 bg-surface-subtle/60" />
            ) : (
              <div className="mt-3 divide-y divide-border">
                {lastEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{entry.date}</p>
                      {(entry.invoiceCount != null || entry.pieceCount != null) && (
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {entry.invoiceCount != null ? `${entry.invoiceCount} ${t('home.salesInvoicesLabel')}` : ''}
                          {entry.invoiceCount != null && entry.pieceCount != null ? ' · ' : ''}
                          {entry.pieceCount != null ? `${entry.pieceCount} ${t('home.salesPiecesLabel')}` : ''}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">{formatSarInt(entry.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionBlock>

      <SectionBlock title="Today's operation" subtitle="Your shift status and assigned work in one view.">
        <KPIGrid cols={2}>
          <KPIStatCard
            title={t('schedule.morning')}
            value={data.todaySchedule.am ? 'On shift' : 'Off'}
            subtitle={data.todaySchedule.am ? 'Scheduled for the morning shift' : 'No morning shift assigned'}
            tone={data.todaySchedule.am ? 'success' : 'default'}
          />
          <KPIStatCard
            title={t('schedule.evening')}
            value={data.todaySchedule.pm ? 'On shift' : 'Off'}
            subtitle={data.todaySchedule.pm ? 'Scheduled for the evening shift' : 'No evening shift assigned'}
            tone={data.todaySchedule.pm ? 'info' : 'default'}
          />
        </KPIGrid>
        <div className="mt-4 rounded-2xl border border-border bg-surface-subtle/50 p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground">{t('tasks.today')}</h3>
          {data.todayTasks.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No tasks assigned for today.</p>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {data.todayTasks.map((task) => (
                <div key={task.taskName} className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-foreground">{task.taskName}</p>
                  <p className="mt-1 text-xs text-muted">{task.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionBlock>

      <SectionBlock title={t('schedule.week')} subtitle="The team roster for the selected week.">
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { label: t('schedule.morning'), people: data.weekRoster.am, tone: 'border-amber-200/80 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/10' },
            { label: t('schedule.evening'), people: data.weekRoster.pm, tone: 'border-sky-200/80 bg-sky-50/50 dark:border-sky-800/50 dark:bg-sky-950/10' },
          ].map((shift) => (
            <article key={shift.label} className={`rounded-2xl border p-4 md:p-5 ${shift.tone}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">{shift.label}</h3>
                <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold tabular-nums text-muted shadow-sm">
                  {shift.people.length}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {shift.people.length === 0 ? (
                  <span className="text-sm text-muted">No employees assigned.</span>
                ) : (
                  shift.people.map((employee) => (
                    <span key={employee.empId} className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm">
                      {employee.name}
                    </span>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      </SectionBlock>
    </PageContainer>
  );
}
