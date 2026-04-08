'use client';

import { useCallback, useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { ShiftCard } from '@/components/ui/ShiftCard';
import { useT } from '@/lib/i18n/useT';
import { formatSarInt } from '@/lib/utils/money';
import { getPerformanceBgClass } from '@/lib/performanceColors';
import { PaceCard } from '@/components/analytics/PaceCard';
import { ForecastCard } from '@/components/analytics/ForecastCard';
import type { ForecastMetrics, PaceMetrics } from '@/lib/analytics/performanceLayer';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';

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
  const [salesEntrySaving, setSalesEntrySaving] = useState(false);
  const [salesEntryError, setSalesEntryError] = useState<string | null>(null);
  const [lastEntries, setLastEntries] = useState<Array<{ id: string; date: string; amount: number }>>([]);
  const [selfAnalytics, setSelfAnalytics] = useState<{
    employees?: Array<{ pace: PaceMetrics; forecast: ForecastMetrics }>;
  } | null>(null);

  const fetchLastEntries = useCallback(() => {
    fetch('/api/me/sales?days=7')
      .then((r) => r.json())
      .then((j: { entries?: Array<{ id: string; date: string; amount: number }> }) => {
        setLastEntries(j.entries ?? []);
      })
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
    setSalesEntryError(null);
    setSalesEntrySaving(true);
    try {
      const res = await fetch('/api/sales/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: salesEntryDate,
          salesSar: amount,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSalesEntryError(j.error ?? 'Save failed');
        return;
      }
      setSalesEntryAmount('');
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

  return (
    <div className="w-full min-w-0 max-w-full p-4 md:p-6">
      <div className="mx-auto w-full min-w-0 max-w-4xl">
        <div className="mb-4 min-w-0">
          <label className="me-2 text-base font-medium text-foreground">{t('common.date')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full min-w-0 rounded border border-border px-3 py-2 text-base sm:w-auto"
          />
        </div>

        {targetsData != null && (targetsData.monthlyTarget > 0 || targetsData.todaySales > 0 || targetsData.mtdSales > 0) && (
          <div className="mb-4 min-w-0">
            <p className="mb-2 text-xs text-muted">{t('home.targetsTodayOnlySubtitle')}</p>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <OpsCard title={t('home.dailyTargetCard')} className="!p-3">
              <p className="text-sm text-muted">
                {t('targets.dailyRequiredPace')}:{' '}
                {targetsData.monthlyTargetMet
                  ? t('home.dailyPaceNotApplicableMet')
                  : formatSarInt(targetsData.todayTarget)}{' '}
                · {t('targets.reportingDailyShort')}: {formatSarInt(targetsData.reportingDailyAllocationSar ?? 0)} ·{' '}
                {t('home.sales')}: {formatSarInt(targetsData.todaySales)}
              </p>
              {targetsData.dailyAchievementPending ? (
                <p className="mt-2 text-sm text-muted">{t('targets.dailyAchievementPending')}</p>
              ) : targetsData.monthlyTargetMet ? (
                <>
                  <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {t('home.dailyPaceMetBecauseMonthlyMet')}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {t('home.mtdAchievedVsMonthlyTarget')
                      .replace('{mtd}', formatSarInt(targetsData.mtdSales))
                      .replace('{target}', formatSarInt(targetsData.monthlyTarget))}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle">
                    <div className="h-full w-full rounded-full bg-emerald-600" />
                  </div>
                  <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {t('home.dailyPaceStatusMet')}
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className={`h-full rounded-full ${targetsData.todayPct > 100 ? getPerformanceBgClass(targetsData.todayPct) : 'bg-accent'}`}
                      style={{ width: `${Math.min(100, Math.max(0, targetsData.todayPct))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground">{Math.round(targetsData.todayPct)}%</p>
                </>
              )}
            </OpsCard>
            <OpsCard title={t('home.monthlyProgressCard')} className="!p-3">
              <p className="text-sm text-muted">
                {t('home.target')}: {formatSarInt(targetsData.monthlyTarget)} · MTD: {formatSarInt(targetsData.mtdSales)} ·{' '}
                {t('targets.remainingMonthlyTarget')}:{' '}
                {formatSarInt(
                  targetsData.remainingMonthTargetSar ?? Math.max(0, targetsData.monthlyTarget - targetsData.mtdSales)
                )}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className={`h-full rounded-full ${targetsData.mtdPct > 100 ? getPerformanceBgClass(targetsData.mtdPct) : 'bg-emerald-600'}`}
                  style={{ width: `${Math.min(100, Math.max(0, targetsData.mtdPct))}%` }}
                />
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{Math.round(targetsData.mtdPct)}%</p>
              {targetsData.monthlyTargetMet && (
                <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {t('home.monthlyTargetAchievedBadge')}
                </p>
              )}
            </OpsCard>
            </div>
          </div>
        )}

        {selfAnalytics?.employees?.[0] && (
          <div className="mb-4 grid min-w-0 gap-4 md:grid-cols-2">
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
              className="!p-3"
            />
            <ForecastCard
              title={t('analytics.monthForecastTitle')}
              linear={selfAnalytics.employees[0].forecast}
              rolling7={null}
              disclaimer={t('analytics.projectionOnly')}
              rollingTitle={t('analytics.forecastRolling7')}
              className="!p-3"
            />
          </div>
        )}

        <OpsCard title="My Sales" className="mb-4">
          <p className="mb-2 text-sm text-muted">Enter daily sales (SAR). Zero is valid.</p>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 sm:w-auto">
              <label className="me-1 text-xs text-muted">Date</label>
              <input
                type="date"
                value={salesEntryDate}
                onChange={(e) => setSalesEntryDate(e.target.value)}
                className="w-full min-w-0 rounded border border-border px-2 py-1.5 text-sm sm:w-auto"
              />
            </div>
            <div className="min-w-0 sm:w-auto">
              <label className="me-1 text-xs text-muted">Amount (SAR)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={salesEntryAmount}
                onChange={(e) => setSalesEntryAmount(e.target.value)}
                placeholder="0"
                className="w-full min-w-0 rounded border border-border px-2 py-1.5 text-sm sm:w-28"
              />
            </div>
            <button
              type="button"
              disabled={salesEntrySaving}
              onClick={saveSalesEntry}
              className="w-full rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50 sm:w-auto"
            >
              {salesEntrySaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {salesEntryError && <p className="mt-2 text-sm text-red-600">{salesEntryError}</p>}
          <p className="mt-2 text-xs text-muted">Last 7 entries:</p>
          <ul className="mt-1 list-inside list-disc ps-4 text-sm text-foreground">
            {lastEntries.length === 0 && <li>—</li>}
            {lastEntries.map((e) => (
              <li key={e.id} className="break-words">{e.date}: {formatSarInt(e.amount)}</li>
            ))}
          </ul>
        </OpsCard>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <ShiftCard variant="morning" title={t('schedule.morning')}>
            {data.todaySchedule.am ? (
              <p className="text-base">You are on shift</p>
            ) : (
              <p className="text-base text-muted">Off</p>
            )}
          </ShiftCard>
          <ShiftCard variant="evening" title={t('schedule.evening')}>
            {data.todaySchedule.pm ? (
              <p className="text-base">You are on shift</p>
            ) : (
              <p className="text-base text-muted">Off</p>
            )}
          </ShiftCard>
        </div>

        <OpsCard title={t('tasks.today')} className="mt-6">
          <ul className="list-disc space-y-1 ps-4">
            {data.todayTasks.map((t) => (
              <li key={t.taskName} className="break-words">
                {t.taskName} <span className="text-muted">({t.reason})</span>
              </li>
            ))}
            {data.todayTasks.length === 0 && <li className="text-muted">—</li>}
          </ul>
        </OpsCard>

        <OpsCard title={t('schedule.week')} className="mt-6">
          <p className="mb-2 text-base text-muted">{t('schedule.morning')}</p>
          <p className="mb-2 text-base break-words">
            {data.weekRoster.am.map((e) => e.name).join(', ') || '—'}
          </p>
          <p className="mb-2 text-base text-muted">{t('schedule.evening')}</p>
          <p className="text-base break-words">
            {data.weekRoster.pm.map((e) => e.name).join(', ') || '—'}
          </p>
        </OpsCard>
      </div>
    </div>
  );
}
