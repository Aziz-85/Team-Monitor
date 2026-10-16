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
    invoiceCount?: number;
    pieceCount?: number;
    salesDays?: number;
  } | null>(null);
  const [taskSnapshot, setTaskSnapshot] = useState<Array<{ id: string; title: string; isCompleted: boolean; kind: 'task' | 'inventory' }>>([]);

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
            invoiceCount?: number;
            pieceCount?: number;
            salesDays?: number;
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
                invoiceCount: d.invoiceCount ?? 0,
                pieceCount: d.pieceCount ?? 0,
                salesDays: d.salesDays ?? 0,
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
          invoiceCount?: number;
          pieceCount?: number;
          salesDays?: number;
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
            invoiceCount: d.invoiceCount ?? 0,
            pieceCount: d.pieceCount ?? 0,
            salesDays: d.salesDays ?? 0,
          });
        }
      }
      )
      .catch(() => setTargetsData(null));
  }, []);

  useEffect(() => {
    fetch('/api/tasks/my-today', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((payload: { tasks?: Array<{ id: string; title: string; isCompleted: boolean; kind: 'task' | 'inventory' }> }) => setTaskSnapshot(payload.tasks ?? []))
      .catch(() => setTaskSnapshot([]));
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
  const inputClass =
    'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15';
  const achievement = Math.max(0, Math.min(100, Math.round(targetsData?.mtdPct ?? 0)));
  const completedTasks = taskSnapshot.filter((task) => task.isCompleted).length;
  const taskPercent = taskSnapshot.length > 0 ? Math.round((completedTasks / taskSnapshot.length) * 100) : 0;

  return (
    <PageContainer className="overflow-x-hidden space-y-8 md:space-y-10">
      <section className="relative overflow-hidden rounded-[30px] bg-[linear-gradient(125deg,#0a2342_0%,#12466a_58%,#0d766e_125%)] p-5 text-white shadow-[0_28px_70px_-36px_rgba(5,25,55,.9)] md:p-7">
        <div className="pointer-events-none absolute -end-20 -top-24 h-72 w-72 rounded-full border border-white/10 bg-white/5" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div><p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-200">My performance</p><h1 className="mt-2 text-3xl font-bold">Keep the momentum moving</h1><p className="mt-2 max-w-xl text-sm text-slate-200">Every sale and completed task moves you closer to your monthly goal.</p></div>
          <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold backdrop-blur"><span>Date</span><input id="employee-home-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent text-sm text-white outline-none [color-scheme:dark]" /></label>
        </div>
        <div className="relative mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/[.07] p-5">
            <div className="relative grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#5eead4 ${achievement * 3.6}deg, rgba(255,255,255,.12) 0deg)` }}><div className="grid h-28 w-28 place-items-center rounded-full bg-[#0d3152]"><div className="text-center"><p className="text-3xl font-black">{achievement}%</p><p className="text-[10px] uppercase tracking-widest text-slate-300">Target</p></div></div></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Month sales', formatSarInt(targetsData?.mtdSales ?? 0), 'Actual achievement'],
              ['Personal target', formatSarInt(targetsData?.monthlyTarget ?? 0), `${formatSarInt(monthlyRemaining)} remaining`],
              ['Invoices', String(targetsData?.invoiceCount ?? 0), `${targetsData?.salesDays ?? 0} selling days`],
              ['Pieces sold', String(targetsData?.pieceCount ?? 0), (targetsData?.invoiceCount ?? 0) > 0 ? `${((targetsData?.pieceCount ?? 0) / (targetsData?.invoiceCount ?? 1)).toFixed(1)} UPT` : 'UPT —'],
            ].map(([label, value, hint]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[.08] p-4 backdrop-blur"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-300">{label}</p><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-slate-300">{hint}</p></article>)}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <article className="rounded-3xl border border-border bg-surface p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-accent">Today&apos;s mission</p><h2 className="mt-1 text-xl font-bold text-foreground">Tasks & execution</h2></div><div className="text-end"><p className="text-2xl font-black text-foreground">{completedTasks}/{taskSnapshot.length}</p><p className="text-xs text-muted">completed</p></div></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-400 transition-all" style={{ width: `${taskPercent}%` }} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{taskSnapshot.length === 0 ? <p className="text-sm text-muted">No tasks assigned for today.</p> : taskSnapshot.map((task) => <div key={task.id} className={`flex items-center gap-3 rounded-xl border p-3 ${task.isCompleted ? 'border-emerald-200 bg-emerald-50/70' : 'border-border bg-surface-subtle/60'}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${task.isCompleted ? 'bg-emerald-500 text-white' : 'bg-white text-muted shadow-sm'}`}>{task.isCompleted ? '✓' : '○'}</span><div><p className="text-sm font-semibold text-foreground">{task.title}</p><p className="text-xs text-muted">{task.kind === 'inventory' ? 'Daily operation' : 'Assigned task'}</p></div></div>)}</div></article>
        <article className="rounded-3xl border border-border bg-surface p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-accent">Today</p><h2 className="mt-1 text-xl font-bold text-foreground">Daily pulse</h2><div className="mt-5 space-y-4"><div><div className="flex justify-between text-sm"><span className="text-muted">Sales</span><strong>{formatSarInt(targetsData?.todaySales ?? 0)}</strong></div><div className="mt-2 h-2 rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, targetsData?.todayPct ?? 0)}%` }} /></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-subtle p-3"><p className="text-xs text-muted">Daily target</p><p className="mt-1 font-bold">{formatSarInt(targetsData?.todayTarget ?? 0)}</p></div><div className="rounded-2xl bg-surface-subtle p-3"><p className="text-xs text-muted">Task progress</p><p className="mt-1 font-bold">{taskPercent}%</p></div></div></div></article>
      </section>

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
