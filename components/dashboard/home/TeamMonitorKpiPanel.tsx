'use client';

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { formatSarInt } from '@/lib/utils/money';
import { dataTableCellNumeric, dataTableTd, dataTableTh, dataTableTheadTr } from '@/lib/ui-styles';
import { ChartCard } from '@/components/ui/ChartCard';
import { PerformanceLineChart } from '@/components/dashboard/PerformanceLineChart';
import { LuxuryTopSellerCard } from '@/components/dashboard/LuxuryTopSellerCard';
import { PaceCard } from '@/components/analytics/PaceCard';
import { ForecastCard } from '@/components/analytics/ForecastCard';
import { OpsCard } from '@/components/ui/OpsCard';
import type { ForecastMetrics, PaceMetrics } from '@/lib/analytics/performanceLayer';

type DailyTrajectoryPoint = { dateKey: string; targetCumulative: number; actualCumulative: number };

type TopSellerEntry = {
  employeeId: string;
  employeeName: string;
  amount: number;
  rank: number;
};

export type TeamMonitorPerformance = {
  monthly: { target: number; sales: number; remaining: number; percent: number };
  weekly: { sales: number };
  hasSalesEntryForToday?: boolean;
  paceDaysPassed?: number;
  todayInSelectedMonth?: boolean;
  reportingDailyAllocationSar?: number;
  reportingWeeklyAllocationSar?: number;
  paceDailyRequiredSar?: number;
  paceWeeklyRequiredSar?: number;
  remainingMonthTargetSar?: number;
  postedLastRecordedDateKey?: string | null;
  postedLastRecordedDaySalesSar?: number;
  monthKey?: string;
  dailyTrajectory?: DailyTrajectoryPoint[];
  topSellers?: {
    week: TopSellerEntry[];
    month: TopSellerEntry[];
  };
  daysInMonth?: number;
};

export type SmartOutlookPayload = {
  required: {
    smartDailyRequiredSar: number;
    smartWeeklyRequiredSar: number;
    linearDailyRequiredSar: number;
    linearWeeklyRequiredSar: number;
    usedEqualWeightFallback: boolean;
    explain: string;
  };
  forecast: {
    forecastSmartSar: number;
    projectedRemainingSmartSar: number;
    varianceVsTargetSar: number;
    confidence: 'high' | 'medium' | 'low';
    rangeConservativeSar: number;
    rangeExpectedSar: number;
    rangeStretchSar: number;
    linearForecastTotalSar: number;
    usedHistoryFallbackForForecast: boolean;
    explain: string;
  };
};

type WeekReportJson = {
  error?: string;
  labelNote?: string;
  boutique?: {
    weekAchievedSar: number;
    reportingWeeklyAllocationSar: number;
    reportingWeeklyRemainingSar: number;
    reportingWeeklyAchievementPct: number;
    paceWeeklyRequiredSar: number;
    paceWeeklyRemainingSar: number;
    paceWeeklyAchievementPct: number;
  };
  employees?: Array<{
    empId: string;
    name: string;
    weekAchievedSar: number;
    reportingWeeklyAllocationSar: number;
    reportingWeeklyAchievementPct: number;
    paceWeeklyRequiredSar: number;
    paceWeeklyAchievementPct: number;
  }>;
};

function interpolateMessage(template: string, vars: Record<string, string | number>) {
  let s = template;
  for (const [k, val] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(val));
  }
  return s;
}

type MonthDailyJson = {
  error?: string;
  labelNote?: string;
  labelNoteOperational?: string;
  rows?: Array<{
    dateKey: string;
    reportingDailyAllocationSar: number;
    achievedSar: number;
    remainingSar: number;
    achievementPct: number;
  }>;
  rowsOperational?: Array<{
    dateKey: string;
    baseDailyTargetSar: number;
    carryInSar: number;
    effectiveDailyTargetSar: number;
    achievedSar: number;
    remainingSar: number;
    achievementPct: number;
  }>;
};

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-surface px-4 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums text-foreground md:text-2xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

type Props = {
  performance: TeamMonitorPerformance;
  monthSmartLayer: { pace: PaceMetrics; forecast: ForecastMetrics } | null;
  smartOutlook: SmartOutlookPayload | null;
  linearForecastApi: { forecastedTotal: number; forecastDelta: number; avgDailyActual: number } | null;
};

export function TeamMonitorKpiPanel({
  performance,
  monthSmartLayer,
  smartOutlook,
  linearForecastApi,
}: Props) {
  const { t } = useT();
  const [weekReport, setWeekReport] = useState<WeekReportJson | null>(null);
  const [dailyReport, setDailyReport] = useState<MonthDailyJson | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [dailyTableMode, setDailyTableMode] = useState<'reporting' | 'operational'>('reporting');

  const monthKey = performance.monthKey ?? '';
  const trajectory = useMemo(() => performance.dailyTrajectory ?? [], [performance.dailyTrajectory]);
  const chartData = trajectory.map((d) => ({
    label: d.dateKey.slice(-2),
    value: d.actualCumulative,
  }));
  const targetLine = trajectory.map((d) => d.targetCumulative);

  useEffect(() => {
    if (!monthKey) return;
    let cancelled = false;
    setReportsError(null);
    Promise.all([
      fetch(`/api/metrics/reports/week?month=${encodeURIComponent(monthKey)}`).then((r) => r.json()),
      fetch(`/api/metrics/reports/month-daily?month=${encodeURIComponent(monthKey)}`).then((r) => r.json()),
    ])
      .then(([w, d]) => {
        if (cancelled) return;
        if (typeof w?.error === 'string' && w.error.toLowerCase().includes('forbidden')) {
          setReportsError(t('home.teamMonitor.reportsForbidden'));
          setWeekReport(null);
          setDailyReport(null);
          return;
        }
        setWeekReport(typeof w?.error === 'string' ? null : w);
        setDailyReport(typeof d?.error === 'string' ? null : d);
      })
      .catch(() => {
        if (!cancelled) {
          setReportsError(t('home.teamMonitor.reportsLoadError'));
          setWeekReport(null);
          setDailyReport(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t stable per locale; refetch only when month changes
  }, [monthKey]);

  useEffect(() => {
    setDailyTableMode('reporting');
  }, [monthKey]);

  const achievedMtd = performance.monthly.sales;
  const remMonth = performance.remainingMonthTargetSar ?? 0;
  const dailyReq = performance.paceDailyRequiredSar ?? 0;
  const weeklyReq = performance.paceWeeklyRequiredSar ?? 0;
  const postedDayKey = performance.postedLastRecordedDateKey;
  const postedDaySar = performance.postedLastRecordedDaySalesSar ?? 0;
  const weekPosted = performance.weekly.sales;
  const monthPosted = performance.monthly.sales;
  const reportingDaily = performance.reportingDailyAllocationSar ?? 0;
  const reportingWeekly = performance.reportingWeeklyAllocationSar ?? 0;

  const reportingChartChrome = useMemo(
    () => ({
      dateKeys: trajectory.map((d) => d.dateKey),
      daysInMonth: performance.daysInMonth ?? Math.max(1, trajectory.length),
      monthKey: monthKey,
      postedLastRecordedDateKey: performance.postedLastRecordedDateKey ?? null,
      todayInSelectedMonth: performance.todayInSelectedMonth ?? false,
      labels: {
        kpiAheadBy: (v: string) =>
          interpolateMessage(t('home.teamMonitor.chartReportingKpiAheadBy'), { v }),
        kpiBehindBy: (v: string) =>
          interpolateMessage(t('home.teamMonitor.chartReportingKpiBehindBy'), { v }),
        targetReachedOnDay: (day: number) =>
          interpolateMessage(t('home.teamMonitor.chartReportingTargetReachedOnDay'), { day }),
        lastRecordedDay: t('home.teamMonitor.chartReportingLastRecordedDay'),
        todayNotPosted: t('home.teamMonitor.chartReportingTodayNotPosted'),
        statusAhead: t('home.teamMonitor.chartReportingStatusAhead'),
        statusBehind: t('home.teamMonitor.chartReportingStatusBehind'),
        legendActual: t('home.teamMonitor.chartReportingLegendActual'),
        legendTarget: t('home.teamMonitor.chartReportingLegendTarget'),
        dayLine: (day: number) => interpolateMessage(t('home.teamMonitor.chartReportingDayLine'), { day }),
        tooltipActual: t('home.teamMonitor.chartReportingTooltipActual'),
        tooltipTarget: t('home.teamMonitor.chartReportingTooltipTarget'),
        tooltipVariance: t('home.teamMonitor.chartReportingTooltipVariance'),
        tooltipStatus: t('home.teamMonitor.chartReportingTooltipStatus'),
      },
    }),
    [
      trajectory,
      monthKey,
      performance.daysInMonth,
      performance.postedLastRecordedDateKey,
      performance.todayInSelectedMonth,
      t,
    ]
  );

  return (
    <section className="mb-10 rounded-2xl border border-border/60 bg-surface/50 p-6 md:p-8">
      {/* SECTION 1 — Executive control (required pace + MTD facts; no % vs “today”) */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {t('home.teamMonitor.section1Title')}
      </h2>
      <p className="mb-4 max-w-3xl text-xs text-muted">{t('home.teamMonitor.section1Blurb')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label={t('home.teamMonitor.achievedMtd')} value={formatSarInt(achievedMtd)} />
        <KpiTile label={t('home.teamMonitor.remainingMonthlyTarget')} value={formatSarInt(remMonth)} />
        <KpiTile
          label={t('home.teamMonitor.dailyRequiredStayOnTrack')}
          value={formatSarInt(dailyReq)}
          sub={t('home.teamMonitor.reportingDailyNote').replace('{v}', formatSarInt(reportingDaily))}
        />
        <KpiTile
          label={t('home.teamMonitor.weeklyRequiredStayOnTrack')}
          value={formatSarInt(weeklyReq)}
          sub={t('home.teamMonitor.reportingWeeklyNote').replace('{v}', formatSarInt(reportingWeekly))}
        />
      </div>

      {/* SECTION 2 — Posted performance (achieved only) */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {t('home.teamMonitor.section2Title')}
      </h2>
      <p className="mb-4 max-w-3xl text-xs text-muted">{t('home.teamMonitor.section2Blurb')}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-surface px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t('home.teamMonitor.lastRecordedDay')}
          </p>
          {postedDayKey ? (
            <>
              <p className="mt-2 text-sm font-medium text-foreground">{postedDayKey}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatSarInt(postedDaySar)}</p>
              {performance.hasSalesEntryForToday === false && (
                <p className="mt-2 text-xs text-amber-800">{t('home.teamMonitor.noPostTodayYet')}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{t('home.teamMonitor.noPostedDayInMonth')}</p>
          )}
        </div>
        <div className="rounded-xl border border-border/80 bg-surface px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t('home.teamMonitor.currentWeekAchievedPosted')}
          </p>
          <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{formatSarInt(weekPosted)}</p>
          <p className="mt-1 text-xs text-muted">{t('home.teamMonitor.riyadhWeekSatFri')}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-surface px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t('home.teamMonitor.currentMonthAchieved')}
          </p>
          <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{formatSarInt(monthPosted)}</p>
        </div>
      </div>

      {/* SECTION 3 — Analysis */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {t('home.teamMonitor.section3Title')}
      </h2>
      {monthSmartLayer && (
        <div className="grid gap-4 lg:grid-cols-2">
          <PaceCard
            title={t('home.teamMonitor.monthlyPaceVsTarget')}
            pace={monthSmartLayer.pace}
            expectedLabel={t('home.teamMonitor.expectedLinearMtd')}
            actualMtdLabel={t('analytics.actualMtdPace')}
            deltaLabel={t('analytics.deltaVsExpected')}
            bandLabels={{
              ahead: t('analytics.ahead'),
              onTrack: t('analytics.onTrack'),
              behind: t('analytics.behind'),
            }}
          />
          <ForecastCard
            title={t('home.teamMonitor.monthEndProjection')}
            linear={monthSmartLayer.forecast}
            rolling7={null}
            disclaimer={t('analytics.projectionOnly')}
            rollingTitle={t('analytics.forecastRolling7')}
          />
        </div>
      )}
      {monthSmartLayer && smartOutlook && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <OpsCard title={t('home.teamMonitor.smartForecastTitle')} className="border border-border/80">
            <p className="mb-3 text-xs text-muted">{t('home.teamMonitor.smartForecastBlurb')}</p>
            <p className="text-xs text-muted">{smartOutlook.forecast.explain}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t('home.teamMonitor.smartForecastMonthEnd')}
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatSarInt(smartOutlook.forecast.forecastSmartSar)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t('home.teamMonitor.smartForecastVsTarget')}
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatSarInt(smartOutlook.forecast.varianceVsTargetSar)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium text-foreground">
              {t('home.teamMonitor.smartConfidenceLabel').replace(
                '{level}',
                t(`home.teamMonitor.smartConfidence.${smartOutlook.forecast.confidence}`)
              )}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-muted">
              <p>
                {t('home.teamMonitor.smartRangeConservative')}:{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatSarInt(smartOutlook.forecast.rangeConservativeSar)}
                </span>
              </p>
              <p>
                {t('home.teamMonitor.smartRangeExpected')}:{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatSarInt(smartOutlook.forecast.rangeExpectedSar)}
                </span>
              </p>
              <p>
                {t('home.teamMonitor.smartRangeStretch')}:{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatSarInt(smartOutlook.forecast.rangeStretchSar)}
                </span>
              </p>
            </div>
            {linearForecastApi != null && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
                {t('home.teamMonitor.smartVsLinearForecast').replace(
                  '{v}',
                  formatSarInt(linearForecastApi.forecastedTotal)
                )}
              </p>
            )}
          </OpsCard>
          <OpsCard title={t('home.teamMonitor.smartRequiredTitle')} className="border border-border/80">
            <p className="mb-3 text-xs text-muted">{t('home.teamMonitor.smartRequiredBlurb')}</p>
            <p className="text-xs text-muted">{smartOutlook.required.explain}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t('home.teamMonitor.smartRequiredToday')}
                </p>
                <p className="text-xl font-bold tabular-nums text-foreground">
                  {formatSarInt(smartOutlook.required.smartDailyRequiredSar)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t('home.teamMonitor.smartVsLinearDaily').replace(
                    '{v}',
                    formatSarInt(smartOutlook.required.linearDailyRequiredSar)
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t('home.teamMonitor.smartRequiredWeek')}
                </p>
                <p className="text-xl font-bold tabular-nums text-foreground">
                  {formatSarInt(smartOutlook.required.smartWeeklyRequiredSar)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t('home.teamMonitor.smartVsLinearWeek').replace(
                    '{v}',
                    formatSarInt(smartOutlook.required.linearWeeklyRequiredSar)
                  )}
                </p>
              </div>
            </div>
          </OpsCard>
        </div>
      )}
      <div className="mt-8">
        <ChartCard
          title={t('home.teamMonitor.chartReportingCumulativeTitle')}
          subtitle={t('home.teamMonitor.chartReportingCumulativeSubtitle')}
          className="w-full md:p-8 [&>div:first-child]:mb-6"
        >
          <PerformanceLineChart
            data={chartData}
            targetLine={targetLine}
            height={320}
            valueFormat={(n) => formatSarInt(n)}
            emptyLabel={t('home.teamMonitor.chartEmpty')}
            reportingChrome={reportingChartChrome}
          />
        </ChartCard>
      </div>

      {/* SECTION 4 — Reporting */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {t('home.teamMonitor.section4Title')}
      </h2>
      <p className="mb-4 max-w-3xl text-xs text-muted">{t('home.teamMonitor.section4Blurb')}</p>
      {reportsError && <p className="mb-4 text-sm text-amber-800">{reportsError}</p>}

      {weekReport?.boutique && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('home.teamMonitor.weeklyBoutiqueReport')}
          </h3>
          {weekReport.labelNote ? <p className="mb-2 text-xs text-muted">{weekReport.labelNote}</p> : null}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] border-collapse text-start text-sm">
              <thead>
                <tr className={dataTableTheadTr}>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colAchievedWeek')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colWeeklyTargetReporting')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colWeeklyRequiredPace')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colPctVsReporting')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colPctVsPace')}</th>
                </tr>
              </thead>
              <tbody className="data-table-tbody">
                <tr className="border-b border-border odd:bg-muted/30">
                  <td className={`${dataTableTd} ${dataTableCellNumeric} font-semibold`}>
                    {formatSarInt(weekReport.boutique.weekAchievedSar)}
                  </td>
                  <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                    {formatSarInt(weekReport.boutique.reportingWeeklyAllocationSar)}
                  </td>
                  <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                    {formatSarInt(weekReport.boutique.paceWeeklyRequiredSar)}
                  </td>
                  <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                    {weekReport.boutique.reportingWeeklyAchievementPct}%
                  </td>
                  <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                    {weekReport.boutique.paceWeeklyAchievementPct}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {weekReport?.employees && weekReport.employees.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('home.teamMonitor.weeklyEmployeeReport')}
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-start text-sm">
              <thead>
                <tr className={dataTableTheadTr}>
                  <th className={`${dataTableTh} text-start`}>{t('home.teamMonitor.colEmployee')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colAchievedWeek')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colWeeklyTargetReporting')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colWeeklyRequiredPace')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colPctVsReporting')}</th>
                  <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colPctVsPace')}</th>
                </tr>
              </thead>
              <tbody className="data-table-tbody">
                {weekReport.employees.map((e) => (
                  <tr key={e.empId} className="border-b border-border odd:bg-muted/30">
                    <td className={`${dataTableTd} max-w-[220px] truncate text-start font-medium`} title={e.name}>
                      {e.name}
                    </td>
                    <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{formatSarInt(e.weekAchievedSar)}</td>
                    <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                      {formatSarInt(e.reportingWeeklyAllocationSar)}
                    </td>
                    <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                      {formatSarInt(e.paceWeeklyRequiredSar)}
                    </td>
                    <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{e.reportingWeeklyAchievementPct}%</td>
                    <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{e.paceWeeklyAchievementPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dailyReport?.rows && dailyReport.rows.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('home.teamMonitor.dailyReportTable')}
          </h3>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDailyTableMode('reporting')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                dailyTableMode === 'reporting'
                  ? 'border-accent bg-accent/15 text-foreground ring-2 ring-accent/30'
                  : 'border-border bg-surface text-muted hover:bg-surface-subtle'
              }`}
            >
              {t('home.teamMonitor.dailyTableModeReporting')}
            </button>
            <button
              type="button"
              onClick={() => setDailyTableMode('operational')}
              disabled={!dailyReport.rowsOperational?.length}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                dailyTableMode === 'operational'
                  ? 'border-accent bg-accent/15 text-foreground ring-2 ring-accent/30'
                  : 'border-border bg-surface text-muted hover:bg-surface-subtle'
              }`}
            >
              {t('home.teamMonitor.dailyTableModeOperational')}
            </button>
          </div>
          <div className="mt-4">
          {dailyTableMode === 'reporting' && dailyReport.labelNote ? (
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{dailyReport.labelNote}</p>
          ) : null}
          {dailyTableMode === 'operational' ? (
            <p className="mb-6 text-xs leading-relaxed text-muted-foreground">
              {t('home.teamMonitor.dailyTableOperationalNoteI18n')}
            </p>
          ) : null}
          <div className="rounded-xl border border-border">
            <div className="overflow-x-auto">
              <div className="max-h-72 overflow-y-auto">
                {dailyTableMode === 'reporting' ? (
                  <table className="w-full min-w-[520px] border-collapse text-start text-sm">
                    <thead className="sticky top-0 z-[1] border-b border-border bg-surface-subtle">
                      <tr className="align-middle">
                        <th className={`${dataTableTh} text-start`}>{t('home.teamMonitor.colDate')}</th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colDailyTargetReporting')}</th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colAchievedDay')}</th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colRemaining')}</th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colPct')}</th>
                      </tr>
                    </thead>
                    <tbody className="data-table-tbody">
                      {dailyReport.rows!.map((r) => (
                        <tr key={r.dateKey} className="border-b border-border odd:bg-muted/30">
                          <td className={`${dataTableTd} whitespace-nowrap font-mono text-xs tabular-nums`}>
                            {r.dateKey}
                          </td>
                          <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                            {formatSarInt(r.reportingDailyAllocationSar)}
                          </td>
                          <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                            {formatSarInt(r.achievedSar)}
                          </td>
                          <td className={`${dataTableTd} ${dataTableCellNumeric}`}>
                            {formatSarInt(r.remainingSar)}
                          </td>
                          <td className={`${dataTableTd} ${dataTableCellNumeric}`}>{r.achievementPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[1000px] table-fixed border-collapse text-start text-sm">
                    <colgroup>
                      <col className="w-[130px]" />
                      <col className="w-[150px]" />
                      <col className="w-[140px]" />
                      <col className="w-[170px]" />
                      <col className="w-[160px]" />
                      <col className="w-[160px]" />
                      <col className="w-[90px]" />
                    </colgroup>
                    <thead className="sticky top-0 z-[1] bg-surface-subtle">
                      <tr className="border-b border-border align-middle">
                        <th className={`${dataTableTh} text-start`}>{t('home.teamMonitor.colDate')}</th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colBaseDailyTarget')}</th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colCarryIn')}</th>
                        <th className={`${dataTableTh} bg-muted/25 text-end text-foreground`}>
                          {t('home.teamMonitor.colEffectiveDailyTarget')}
                        </th>
                        <th className={`${dataTableTh} border-l border-border/60 ps-4 text-end`}>
                          {t('home.teamMonitor.colAchievedOpShort')}
                        </th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colRemainingOpShort')}</th>
                        <th className={`${dataTableTh} text-end`}>{t('home.teamMonitor.colPct')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dailyReport.rowsOperational ?? []).map((r) => {
                        const surplus = r.remainingSar < 0;
                        const largeShortfall =
                          r.remainingSar > 0 && r.effectiveDailyTargetSar > 0 && r.achievementPct < 40;
                        const remainingCls = surplus
                          ? 'text-emerald-600 dark:text-emerald-500'
                          : largeShortfall
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-foreground';
                        return (
                          <tr
                            key={r.dateKey}
                            className="border-b border-border odd:bg-muted/30 hover:bg-muted/50"
                          >
                            <td className="whitespace-nowrap px-3 py-2.5 align-middle font-mono text-xs tabular-nums text-foreground">
                              {r.dateKey}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-end font-medium tabular-nums text-foreground">
                              {formatSarInt(r.baseDailyTargetSar)}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-end font-medium tabular-nums text-foreground">
                              {formatSarInt(r.carryInSar)}
                            </td>
                            <td className="bg-muted/20 px-3 py-2.5 align-middle text-end text-sm font-semibold tabular-nums text-foreground">
                              {formatSarInt(r.effectiveDailyTargetSar)}
                            </td>
                            <td className="border-l border-border/60 px-3 py-2.5 ps-4 align-middle text-end font-medium tabular-nums text-foreground">
                              {formatSarInt(r.achievedSar)}
                            </td>
                            <td className={`px-3 py-2.5 align-middle text-end font-medium tabular-nums ${remainingCls}`}>
                              {formatSarInt(r.remainingSar)}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-end font-medium tabular-nums text-foreground">
                              {r.achievementPct}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {performance.topSellers && (
        <>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('home.teamMonitor.topSellersHeading')}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <LuxuryTopSellerCard
              title={t('home.teamMonitor.topSellersThisWeek')}
              entries={performance.topSellers.week ?? []}
              emptyLabel={t('home.teamMonitor.topSellersWeekEmpty')}
            />
            <LuxuryTopSellerCard
              title={t('home.teamMonitor.topSellersThisMonth')}
              entries={performance.topSellers.month ?? []}
              emptyLabel={t('home.teamMonitor.topSellersMonthEmpty')}
            />
          </div>
        </>
      )}
    </section>
  );
}
