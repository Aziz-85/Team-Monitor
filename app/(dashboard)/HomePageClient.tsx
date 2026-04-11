'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { useT } from '@/lib/i18n/useT';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { ZonesMapDialog } from '@/components/inventory/ZonesMapDialog';
import { getZoneBadgeClasses } from '@/lib/zones';
import { TeamMonitorKpiPanel } from '@/components/dashboard/home/TeamMonitorKpiPanel';
import { CoverageStatusCard } from '@/components/dashboard/home/CoverageStatusCard';
import { ShiftSnapshotCard } from '@/components/dashboard/home/ShiftSnapshotCard';
import { KeyHolderCard } from '@/components/dashboard/home/KeyHolderCard';
import { TasksTodayCard } from '@/components/dashboard/home/TasksTodayCard';
import { OperationalAlertsCard } from '@/components/dashboard/home/OperationalAlertsCard';
import { ComplianceExpiryCard } from '@/components/dashboard/home/ComplianceExpiryCard';
import { CardShell } from '@/components/dashboard/cards/CardShell';
import { computeForecast, computePaceMetrics } from '@/lib/analytics/performanceLayer';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { formatSarInt } from '@/lib/utils/money';
import Link from 'next/link';
import {
  EmptyStateBlock,
  InsightCard,
  InsightGrid,
  KPIGrid,
  KPIStatCard,
  PageContainer,
  RecommendationCard,
  SectionBlock,
} from '@/components/ui/ExecutiveIntelligence';
import {
  attentionSeverity,
  completionSignal,
  coverageSignal,
  paceSignal,
} from '@/lib/presentation/executiveIntelligence';
import { useQuickActions } from '@/lib/nav/useQuickActions';
import { Button } from '@/components/ui/Button';

function weekStartFor(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type ValidationResult = {
  type: string;
  severity: string;
  message: string;
  amCount: number;
  pmCount: number;
  minAm: number;
  minPm: number;
};

type CoverageSuggestion = {
  date: string;
  fromShift: string;
  toShift: string;
  empId: string;
  employeeName: string;
  reason: string;
  impact: { amBefore: number; pmBefore: number; amAfter: number; pmAfter: number };
};

type HomeData = {
  date: string;
  roster: {
    amEmployees: Array<{ empId: string; name: string }>;
    pmEmployees: Array<{ empId: string; name: string }>;
    warnings: string[];
  };
  coverageValidation?: ValidationResult[];
  coverageSuggestion?: CoverageSuggestion | null;
  coverageSuggestionExplanation?: string;
  todayTasks: Array<{
    taskName: string;
    assignedTo: string | null;
    reason: string;
    reasonNotes: string[];
  }>;
};

type MyTodayTask = {
  id: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  completedAt?: string | null;
  kind: 'task' | 'inventory';
};

type PerformanceSummary = {
  monthKey?: string;
  postedLastRecordedDateKey?: string | null;
  postedLastRecordedDaySalesSar?: number;
  daily: { target: number; sales: number; remaining: number; percent: number };
  weekly: { target: number; sales: number; remaining: number; percent: number };
  monthly: { target: number; sales: number; remaining: number; percent: number };
  hasSalesEntryForToday?: boolean;
  paceDaysPassed?: number;
  todayInSelectedMonth?: boolean;
  reportingDailyAllocationSar?: number;
  reportingWeeklyAllocationSar?: number;
  paceDailyRequiredSar?: number;
  paceWeeklyRequiredSar?: number;
  remainingMonthTargetSar?: number;
  dailyTrajectory?: { dateKey: string; targetCumulative: number; actualCumulative: number }[];
  topSellers?: {
    week: Array<{ employeeId: string; employeeName: string; amount: number; rank: number }>;
    month: Array<{ employeeId: string; employeeName: string; amount: number; rank: number }>;
  };
  daysInMonth?: number;
  todayDayOfMonth?: number;
  linearForecast?: {
    forecastedTotal: number;
    forecastDelta: number;
    avgDailyActual: number;
  };
  smartOutlook?: {
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
  } | null;
};

type HomePageClientProps = {
  myZone?: { zone: string } | null;
  boutiqueName?: string;
};

export function HomePageClient({ myZone, boutiqueName = '' }: HomePageClientProps) {
  const { t } = useT();
  const { actions: quickActions, track: trackQuickAction } = useQuickActions(5);
  const [data, setData] = useState<HomeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState(() => getRiyadhDateKey());
  const [weekSummary, setWeekSummary] = useState<Array<{
    date: string;
    dayName: string;
    messages: string[];
    suggestion?: { empId: string; employeeName: string } | null;
  }>>([]);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);
  const [myTodayTasks, setMyTodayTasks] = useState<MyTodayTask[] | null>(null);
  const [myTodayTasksLoading, setMyTodayTasksLoading] = useState(false);
  const [myTodayTasksError, setMyTodayTasksError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [complianceAlerts, setComplianceAlerts] = useState<Array<{
    id: string;
    name: string;
    daysRemaining: number;
    status: 'expired' | 'urgent' | 'warning';
  }>>([]);
  const [complianceNextExpiry, setComplianceNextExpiry] = useState<{ name: string; daysRemaining: number } | null>(null);
  const [copyDailySummaryFeedback, setCopyDailySummaryFeedback] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyDailySummaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyDailySummaryTimerRef.current) clearTimeout(copyDailySummaryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMyTodayTasksLoading(true);
    setMyTodayTasksError(null);

    const perfP = fetch('/api/performance/summary')
      .then((r) => r.json())
      .then((d: PerformanceSummary) => {
        if (cancelled) return;
        if (d?.daily != null) setPerformance(d);
      })
      .catch(() => {
        if (!cancelled) setPerformance(null);
      });

    const tasksP = fetch('/api/tasks/my-today')
      .then((r) => r.json().catch(() => null))
      .then((json: { tasks?: MyTodayTask[]; error?: string } | null) => {
        if (cancelled) return;
        if (!json || !Array.isArray(json.tasks)) {
          setMyTodayTasks([]);
          if (json?.error) setMyTodayTasksError(json.error);
          return;
        }
        setMyTodayTasks(json.tasks);
      })
      .catch(() => {
        if (cancelled) return;
        setMyTodayTasks([]);
        setMyTodayTasksError('Failed to load');
      });

    Promise.all([perfP, tasksP]).finally(() => {
      if (!cancelled) setMyTodayTasksLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLoadError(null);
    fetch(`/api/home?date=${date}`)
      .then((r) => r.text().then((text) => {
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        return { ok: r.ok, json };
      }))
      .then(({ ok, json }) => {
        const obj = json as { roster?: unknown; error?: string; details?: string } | null;
        if (ok && obj?.roster != null) {
          setData(obj as HomeData);
          setLoadError(null);
        } else {
          setData(null);
          setLoadError(obj?.error || obj?.details || 'Failed to load');
        }
      })
      .catch(() => {
        setData(null);
        setLoadError('Failed to load');
      });
  }, [date]);

  useEffect(() => {
    const ws = weekStartFor(date);
    fetch(`/api/schedule/week?weekStart=${ws}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((week: {
        days?: Array<{
          date: string;
          coverageValidation?: ValidationResult[];
          coverageSuggestion?: { empId: string; employeeName: string } | null;
        }>;
      } | null) => {
        if (!week?.days) {
          setWeekSummary([]);
          return;
        }
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const list = week.days
          .filter((d) => d.coverageValidation?.length)
          .map((d) => ({
            date: d.date,
            dayName: dayNames[new Date(d.date + 'T12:00:00Z').getUTCDay()],
            messages: (d.coverageValidation ?? []).map((v: ValidationResult) => v.message),
            suggestion: d.coverageSuggestion ?? null,
          }));
        setWeekSummary(list);
      })
      .catch(() => setWeekSummary([]));
  }, [date]);

  useEffect(() => {
    fetch('/api/compliance/alerts')
      .then((r) => r.json())
      .then((data: {
        alerts?: Array<{ id: string; name: string; daysRemaining: number; status: string }>;
        nextExpiry?: { name: string; daysRemaining: number } | null;
      }) => {
        const list = (data?.alerts ?? []).filter((a) => ['expired', 'urgent', 'warning'].includes(a.status)) as Array<{
          id: string;
          name: string;
          daysRemaining: number;
          status: 'expired' | 'urgent' | 'warning';
        }>;
        setComplianceAlerts(list);
        setComplianceNextExpiry(data?.nextExpiry ?? null);
      })
      .catch(() => {
        setComplianceAlerts([]);
        setComplianceNextExpiry(null);
      });
  }, []);

  const monthSmartLayer = useMemo(() => {
    if (
      !performance?.monthly ||
      performance.daysInMonth == null ||
      performance.paceDaysPassed == null ||
      performance.daysInMonth <= 0
    ) {
      return null;
    }
    const daysPassed = performance.paceDaysPassed;
    return {
      pace: computePaceMetrics({
        actualMTD: performance.monthly.sales,
        monthlyTarget: performance.monthly.target,
        totalDaysInMonth: performance.daysInMonth,
        daysPassed,
      }),
      forecast: computeForecast({
        actualMTD: performance.monthly.sales,
        monthlyTarget: performance.monthly.target,
        totalDaysInMonth: performance.daysInMonth,
        daysPassed,
      }),
    };
  }, [performance]);

  if (!data) {
    return (
      <PageContainer>
        <EmptyStateBlock
          title={loadError ? t('home.homeLoadFailed') : t('home.homeLoading')}
          description={loadError ?? t('home.homeLoadingDescription')}
        />
      </PageContainer>
    );
  }

  const todayStr = getRiyadhDateKey();
  const isSelectedToday = date === todayStr;

  const roster = data.roster ?? {
    amEmployees: [] as Array<{ empId: string; name: string }>,
    pmEmployees: [] as Array<{ empId: string; name: string }>,
    warnings: [] as string[],
  };
  const coverageValidation: ValidationResult[] = data.coverageValidation ?? [];
  const coverageSuggestion = data.coverageSuggestion ?? null;
  const coverageSuggestionExplanation = data.coverageSuggestionExplanation;
  const totalWarnings = coverageValidation.length + weekSummary.length + complianceAlerts.length;
  const tasksTotal = myTodayTasks?.length ?? 0;
  const tasksCompleted = myTodayTasks?.filter((tt) => tt.isCompleted).length ?? 0;
  const tasksPending = Math.max(0, tasksTotal - tasksCompleted);
  const taskCompletionPct = tasksTotal > 0 ? Math.round((tasksCompleted * 100) / tasksTotal) : 100;
  const weekCoveragePct = Math.round(((7 - Math.min(7, weekSummary.length)) * 100) / 7);
  const pace = performance?.monthly.percent ?? 0;
  const paceUi = paceSignal(
    pace,
    {
      ahead: t('home.executive.ahead'),
      near: t('home.executive.slightlyBelow'),
      behind: t('home.executive.behind'),
      aheadHint: t('home.executive.paceAheadHint'),
      nearHint: t('home.executive.paceNearHint'),
      behindHint: t('home.executive.paceBehindHint'),
    }
  );
  const tasksUi = completionSignal(
    taskCompletionPct,
    {
      healthy: t('home.executive.tasksHealthy'),
      attention: t('home.executive.tasksAttention'),
      critical: t('home.executive.tasksRisk'),
      healthyHint: t('home.executive.tasksHealthyHint'),
      attentionHint: t('home.executive.tasksAttentionHint'),
      criticalHint: t('home.executive.tasksRiskHint'),
    }
  );
  const coverageUi = coverageSignal(
    weekCoveragePct,
    {
      healthy: t('home.executive.coverageHealthy'),
      watch: t('home.executive.coverageWatch'),
      weak: t('home.executive.coverageWeak'),
      healthyHint: t('home.executive.coverageHealthyHint'),
      watchHint: t('home.executive.coverageWatchHint'),
      weakHint: t('home.executive.coverageWeakHint'),
    }
  );
  const attentionUi = attentionSeverity(
    totalWarnings,
    {
      none: t('home.executive.noImmediateIssues'),
      low: t('home.executive.someAttention'),
      high: t('home.executive.highAttention'),
      noneHint: t('home.executive.noImmediateIssuesHint'),
      lowHint: t('home.executive.someAttentionHint'),
      highHint: t('home.executive.highAttentionHint'),
    }
  );
  const paceToneForKpi = paceUi.tone === 'warning' || paceUi.tone === 'danger' ? paceUi.tone : 'default';
  const remainingToneForKpi =
    (performance?.remainingMonthTargetSar ?? 0) > 0
      ? paceUi.tone === 'danger'
        ? 'danger'
        : 'warning'
      : 'success';
  const coverageToneForKpi = coverageUi.tone === 'warning' || coverageUi.tone === 'danger' ? coverageUi.tone : 'default';
  const taskToneForKpi = tasksUi.tone === 'warning' || tasksUi.tone === 'danger' ? tasksUi.tone : 'default';
  const attentionToneForKpi = attentionUi.tone === 'warning' || attentionUi.tone === 'danger' ? attentionUi.tone : 'default';

  const heroTitle =
    paceUi.tone === 'danger'
      ? t('home.executive.heroBehind')
      : paceUi.tone === 'warning'
        ? t('home.executive.heroNear')
        : t('home.executive.heroAhead');
  const heroHint =
    paceUi.tone === 'danger'
      ? t('home.executive.heroBehindHint')
      : paceUi.tone === 'warning'
        ? t('home.executive.heroNearHint')
        : t('home.executive.heroAheadHint');
  const recommendationCards: Array<{ title: string; message: string; tone: 'warning' | 'danger' | 'info' | 'success' }> = [];
  if (paceUi.tone === 'danger' || paceUi.tone === 'warning') {
    recommendationCards.push({
      title: t('home.executive.recoPaceTitle'),
      message: t('home.executive.recoPaceMessage'),
      tone: paceUi.tone,
    });
  }
  if (tasksUi.tone === 'danger' || tasksUi.tone === 'warning') {
    recommendationCards.push({
      title: t('home.executive.recoTasksTitle'),
      message: t('home.executive.recoTasksMessage'),
      tone: tasksUi.tone,
    });
  } else if (coverageUi.tone === 'warning' || coverageUi.tone === 'danger') {
    recommendationCards.push({
      title: t('home.executive.recoCoverageTitle'),
      message: t('home.executive.recoCoverageMessage'),
      tone: coverageUi.tone,
    });
  }
  const todayTasks = data.todayTasks ?? [];

  const handleCopyDailySummary = async () => {
    if (!performance) return;
    const branchLine = boutiqueName.trim();
    const dateLine = getRiyadhDateKey();
    const text = `${branchLine}
${dateLine}

Today Sales: ${formatSarInt(performance.daily.sales)}
Daily Target: ${formatSarInt(performance.daily.target)}
${t('sales.dailyLedger.copyLabelAchievementDaily')} ${performance.daily.percent}%`;
    if (copyDailySummaryTimerRef.current) {
      clearTimeout(copyDailySummaryTimerRef.current);
      copyDailySummaryTimerRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyDailySummaryFeedback('copied');
      copyDailySummaryTimerRef.current = setTimeout(() => {
        setCopyDailySummaryFeedback('idle');
        copyDailySummaryTimerRef.current = null;
      }, 2000);
    } catch {
      setCopyDailySummaryFeedback('error');
      copyDailySummaryTimerRef.current = setTimeout(() => {
        setCopyDailySummaryFeedback('idle');
        copyDailySummaryTimerRef.current = null;
      }, 2500);
    }
  };

  const applySuggestion = async () => {
    if (!coverageSuggestion || applyingSuggestion) return;
    setApplyingSuggestion(true);
    try {
      const res = await fetch('/api/suggestions/coverage/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: data.date, empId: coverageSuggestion.empId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setLoadError(null);
        const homeRes = await fetch(`/api/home?date=${date}`);
        const homeJson = await homeRes.json().catch(() => null);
        if (homeJson?.roster != null) setData(homeJson as HomeData);
        const ws = weekStartFor(date);
        const weekRes = await fetch(`/api/schedule/week?weekStart=${ws}`, { cache: 'no-store' });
        const weekJson = await weekRes.json().catch(() => null);
        if (weekJson?.days) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          setWeekSummary(
            weekJson.days
              .filter((d: { coverageValidation?: ValidationResult[] }) => d.coverageValidation?.length)
              .map((d: { date: string; coverageValidation: ValidationResult[] }) => ({
                date: d.date,
                dayName: dayNames[new Date(d.date + 'T12:00:00Z').getUTCDay()],
                messages: (d.coverageValidation ?? []).map((v: ValidationResult) => v.message),
              }))
          );
        }
      } else {
        setLoadError(json.error || 'Failed to apply suggestion');
      }
    } finally {
      setApplyingSuggestion(false);
    }
  };

  const myZoneBadgeText = myZone
    ? (t('inventory.myZoneBadge') as string).replace('{zone}', myZone.zone)
    : t('inventory.zoneNotAssignedShort');

  return (
    <PageContainer className="overflow-x-hidden space-y-8 md:space-y-10">
      <SectionBlock
        title={t('nav.dashboard')}
        subtitle={t('home.executiveHeaderSubtitle')}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                myZone ? getZoneBadgeClasses(myZone.zone) : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {myZoneBadgeText}
            </span>
            {myZone && (
              <button
                type="button"
                onClick={() => setZoneDialogOpen(true)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-surface-subtle"
              >
                {t('inventory.openMap')}
              </button>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-muted">{t('common.date')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm"
          />
          <p className="text-xs text-muted">{t('home.dateContextHint')}</p>
        </div>
      </SectionBlock>

      <RecommendationCard
        title={heroTitle}
        message={heroHint}
        tone={paceUi.tone}
        className="border-2 p-5 md:p-6"
      />

      <SectionBlock title={t('home.quickActionsTitle')} subtitle={t('home.quickActionsSubtitle')}>
        <InsightGrid className="gap-4">
          {quickActions.slice(0, 5).map((a) => (
            <Link
              key={a.key}
              href={a.href}
              onClick={() => trackQuickAction(a.key)}
              className="block"
            >
              <RecommendationCard
                title={t(a.titleKey)}
                message={t(a.hintKey)}
                tone="info"
                className="hover:bg-surface-subtle"
                actionSlot={<span className="text-xs font-medium text-muted">{t('home.quickActionsGo')}</span>}
              />
            </Link>
          ))}
        </InsightGrid>
      </SectionBlock>

      <SectionBlock title={t('home.executiveKpiTitle')} subtitle={t('home.executiveKpiSubtitle')}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <KPIStatCard
            title={t('home.executive.primaryTargetPct')}
            value={`${Math.max(0, Math.round(pace))}%`}
            tone={paceToneForKpi}
            emphasis="strong"
            trendLabel={paceUi.shortLabel}
            supportLabel={t('home.executive.primarySignal')}
          />
          <KPIStatCard
            title={t('home.teamMonitor.remainingMonthlyTarget')}
            value={formatSarInt(performance?.remainingMonthTargetSar ?? 0)}
            tone={remainingToneForKpi}
            emphasis="strong"
            supportLabel={t('home.executive.primarySignal')}
          />
        </div>
        <KPIGrid cols={4} className="mt-3">
          <KPIStatCard
            title={t('home.todayTasksTitle')}
            value={`${tasksCompleted}/${tasksTotal}`}
            subtitle={t('home.executive.pendingCount').replace('{count}', String(tasksPending))}
            tone={taskToneForKpi}
          />
          <KPIStatCard
            title={t('home.coverageStatus')}
            value={`${weekCoveragePct}%`}
            subtitle={t('coverage.thisWeekDaysNeedAttention').replace('{count}', String(weekSummary.length))}
            tone={coverageToneForKpi}
          />
          <KPIStatCard
            title={t('home.complianceAlerts')}
            value={complianceAlerts.length}
            subtitle={t('home.executive.alertsAndWarnings').replace('{count}', String(totalWarnings))}
            tone={attentionToneForKpi}
          />
          <KPIStatCard
            title={t('home.teamMonitor.currentWeekAchievedPosted')}
            value={formatSarInt(performance?.weekly.sales ?? 0)}
            subtitle={t('home.teamMonitor.riyadhWeekSatFri')}
            tone="default"
          />
        </KPIGrid>
      </SectionBlock>

      <SectionBlock title={t('home.executiveInsightsTitle')} subtitle={t('home.executiveInsightsSubtitle')}>
        <InsightGrid className="gap-4">
          <InsightCard
            title={t('home.executive.insightPaceTitle')}
            description={paceUi.shortLabel}
            tone={paceUi.tone}
            className="md:col-span-2"
          />
          <InsightCard title={t('home.executive.insightTasksTitle')} description={tasksUi.shortLabel} tone={tasksUi.tone} />
          <InsightCard title={t('home.executive.insightCoverageTitle')} description={coverageUi.shortLabel} tone={coverageUi.tone} />
          <InsightCard title={t('home.executive.insightAttentionTitle')} description={attentionUi.shortLabel} tone={attentionUi.tone} />
        </InsightGrid>
      </SectionBlock>

      <SectionBlock title={t('home.executive.recommendedActionTitle')} subtitle={t('home.executiveRecommendationsSubtitle')}>
        {recommendationCards.length === 0 ? (
          <EmptyStateBlock title={t('home.executive.noRecommendationsTitle')} description={t('home.executive.noRecommendationsDesc')} />
        ) : (
          <InsightGrid>
            {recommendationCards.slice(0, 2).map((r, idx) => (
              <RecommendationCard key={`${r.title}-${idx}`} title={r.title} message={r.message} tone={r.tone} />
            ))}
          </InsightGrid>
        )}
      </SectionBlock>

      <SectionBlock
        title={t('home.executiveOperationalTitle')}
        subtitle={t('home.executiveOperationalSubtitle')}
        rightSlot={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!performance}
              className="h-8 px-3 text-xs"
              onClick={handleCopyDailySummary}
            >
              Copy Daily Summary
            </Button>
            {copyDailySummaryFeedback === 'copied' ? (
              <span className="text-xs text-muted-foreground">Copied</span>
            ) : copyDailySummaryFeedback === 'error' ? (
              <span className="text-xs text-destructive">Failed to copy</span>
            ) : null}
          </div>
        }
      >
        <div className="space-y-6">
          {performance && (
            <TeamMonitorKpiPanel
              performance={performance}
              monthSmartLayer={monthSmartLayer}
              smartOutlook={performance.smartOutlook ?? null}
              linearForecastApi={performance.linearForecast ?? null}
            />
          )}

          {/* Compliance & Expiry */}
          <ComplianceExpiryCard
            alerts={complianceAlerts}
            nextExpiry={complianceNextExpiry}
            titleLabel={t('home.complianceExpiryTitle')}
            allValidLabel={t('home.complianceAllValid')}
            nextExpiryLabel={t('home.complianceNextExpiry') as string}
            expiredAgoLabel={t('home.complianceExpiredAgo') as string}
            daysRemainingLabel={t('home.complianceDaysLeft') as string}
            viewAllLabel={t('home.complianceViewAll')}
            viewAllHref="/compliance"
          />

          {/* ROW 1: Coverage Status | Shift Snapshot */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CoverageStatusCard
              selectedDayMessage={coverageValidation.length > 0 ? coverageValidation[0].message : null}
              weekWarningCount={weekSummary.length}
              suggestedAction={
                coverageSuggestion
                  ? {
                      employeeName: coverageSuggestion.employeeName,
                      impact: coverageSuggestion.impact,
                    }
                  : null
              }
              onApplySuggestion={applySuggestion}
              applying={applyingSuggestion}
              applyLabel={t('coverage.applySuggestion')}
              beforeAfterLabel={t('coverage.beforeAfter') as string}
              moveSuggestionLabel={t('coverage.moveSuggestion') as string}
              titleLabel={t('home.coverageStatus')}
              selectedDayLabel={t('home.selectedDay')}
              selectedDateNoIssueLabel={t('coverage.selectedDateNoIssue')}
              selectedDateAllClearLabel={t('coverage.selectedDateAllClear')}
              thisWeekLabel={t('coverage.thisWeekLabel')}
              thisWeekDaysNeedAttentionLabel={t('coverage.thisWeekDaysNeedAttention') as string}
              thisWeekNoWarningsLabel={t('coverage.thisWeekNoWarnings')}
              suggestedActionLabel={t('coverage.suggestedActionLabel')}
            />
            <ShiftSnapshotCard
              morningLabel={t('schedule.morning')}
              eveningLabel={t('schedule.evening')}
              amEmployees={roster.amEmployees}
              pmEmployees={roster.pmEmployees}
            />
          </div>

          {/* ROW 2: Key Holder | Tasks Today */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <KeyHolderCard
              title={isSelectedToday ? t('home.keyHolderToday') : t('home.keyHolder')}
              subtitle={!isSelectedToday ? (t('home.keyHolderForDate') as string).replace('{date}', date) : null}
              primaryLabel={t('tasks.primary')}
              backupLabel={t('tasks.backup1')}
              unassignedLabel={t('tasks.unassigned')}
              tasks={todayTasks}
            />
            <TasksTodayCard
              title={t('home.todayTasksTitle')}
              total={myTodayTasks?.length ?? 0}
              completed={myTodayTasks?.filter((t) => t.isCompleted).length ?? 0}
              pending={myTodayTasks ? myTodayTasks.length - myTodayTasks.filter((t) => t.isCompleted).length : 0}
              loading={myTodayTasksLoading}
              error={myTodayTasksError}
              emptyLabel={t('home.noTasksToday')}
              doneLabel={t('tasks.done')}
            >
              {myTodayTasks?.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{task.title}</span>
                  {task.isCompleted && (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {t('tasks.done')}
                    </span>
                  )}
                  {task.kind === 'task' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (updatingTaskId) return;
                        const action = task.isCompleted ? 'undo' : 'done';
                        setUpdatingTaskId(task.id);
                        try {
                          const res = await fetch('/api/tasks/completion', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ taskId: task.id, action }),
                          });
                          if (res.ok) {
                            const next = await fetch('/api/tasks/my-today')
                              .then((r) => r.json().catch(() => null))
                              .catch(() => null);
                            if (next && Array.isArray(next.tasks)) {
                              setMyTodayTasks(next.tasks as MyTodayTask[]);
                            }
                          }
                        } finally {
                          setUpdatingTaskId(null);
                        }
                      }}
                      disabled={updatingTaskId === task.id}
                      className={
                        task.isCompleted
                          ? 'rounded-lg border border-border bg-surface px-3 py-1 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50'
                          : 'rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50'
                      }
                    >
                      {updatingTaskId === task.id
                        ? t('common.loading')
                        : task.isCompleted
                          ? t('tasks.undo')
                          : t('tasks.markDone')}
                    </button>
                  )}
                </li>
              ))}
            </TasksTodayCard>
          </div>

          {/* ROW 3: Operational Alerts + Today Tasks (assigned) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <OperationalAlertsCard
              title={t('home.operationalAlerts')}
              allClearLabel={t('home.allClear')}
              alerts={[
                ...coverageValidation.map((v, i) => ({
                  key: `cov-${i}`,
                  label: 'Coverage',
                  value: v.message,
                  severity: 'warn' as const,
                })),
                ...weekSummary.map((d) => ({
                  key: `week-${d.date}`,
                  label: `${d.dayName} ${d.date.slice(8)}`,
                  value: d.messages.join('; '),
                  severity: 'warn' as const,
                })),
                ...(coverageSuggestionExplanation && !coverageSuggestion && coverageValidation.some((v) => v.type === 'AM_GT_PM')
                  ? [{ key: 'explain', label: 'Note', value: String(coverageSuggestionExplanation), severity: 'info' as const }]
                  : []),
              ]}
            />
            <CardShell variant="home">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                {isSelectedToday ? t('tasks.today') : (t('home.tasksForDate') as string).replace('{date}', date)}
              </h3>
              <ul className="space-y-2">
                {todayTasks.map((task) => (
                  <li key={task.taskName} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{task.taskName}</span>
                    <span className="text-muted">→ {task.assignedTo ?? t('tasks.unassigned')}</span>
                    <StatusPill
                      variant={
                        task.reason === 'Primary' ? 'primary'
                          : task.reason === 'Backup1' ? 'backup1'
                          : task.reason === 'Backup2' ? 'backup2'
                          : 'unassigned'
                      }
                    >
                      {task.reason === 'Primary' ? t('tasks.primary')
                        : task.reason === 'Backup1' ? t('tasks.backup1')
                        : task.reason === 'Backup2' ? t('tasks.backup2')
                        : t('tasks.unassigned')}
                    </StatusPill>
                    {task.reasonNotes.length > 0 && (
                      <span className="text-muted">({task.reasonNotes.join('; ')})</span>
                    )}
                  </li>
                ))}
                {todayTasks.length === 0 && <li className="text-muted">—</li>}
              </ul>
            </CardShell>
          </div>

          {/* Week summary apply buttons */}
          {weekSummary.length > 0 && (
            <CardShell variant="home">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                {t('coverage.weekSummary')}
              </h3>
              <ul className="space-y-2">
                {weekSummary.map((d) => (
                  <li key={d.date} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      <span className="font-medium">{d.dayName} {d.date.slice(8)}/{d.date.slice(5, 7)}:</span>{' '}
                      {d.messages.join('; ')}
                      {d.suggestion && (
                        <span className="ms-1 text-foreground">
                          — {(t('coverage.moveSuggestion') as string).replace('{name}', d.suggestion.employeeName)}
                        </span>
                      )}
                    </span>
                    {d.suggestion && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch('/api/suggestions/coverage/apply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ date: d.date, empId: d.suggestion!.empId }),
                          });
                          if (res.ok) {
                            const homeRes = await fetch(`/api/home?date=${date}`);
                            const homeJson = await homeRes.json().catch(() => null);
                            if (homeJson?.roster != null) setData(homeJson as HomeData);
                            const ws = weekStartFor(date);
                            const weekRes = await fetch(`/api/schedule/week?weekStart=${ws}`, { cache: 'no-store' });
                            const weekJson = await weekRes.json().catch(() => null);
                            if (weekJson?.days) {
                              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                              setWeekSummary(
                                weekJson.days
                                  .filter((day: { coverageValidation?: ValidationResult[] }) => day.coverageValidation?.length)
                                  .map((day: { date: string; coverageValidation: ValidationResult[]; coverageSuggestion?: { empId: string; employeeName: string } | null }) => ({
                                    date: day.date,
                                    dayName: dayNames[new Date(day.date + 'T12:00:00Z').getUTCDay()],
                                    messages: (day.coverageValidation ?? []).map((v: ValidationResult) => v.message),
                                    suggestion: day.coverageSuggestion ?? null,
                                  }))
                              );
                            }
                          }
                        }}
                        className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
                      >
                        {t('coverage.applySuggestion')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </CardShell>
          )}
        </div>
      </SectionBlock>

      <SectionBlock title={t('home.executiveSecondaryTitle')} subtitle={t('home.executiveSecondarySubtitle')}>
        <p className="text-sm text-muted">{t('home.executiveSecondaryHint')}</p>
      </SectionBlock>
      {zoneDialogOpen && myZone && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden
            onClick={() => setZoneDialogOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-foreground">
                {t('inventory.zonesMapTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setZoneDialogOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-sm text-muted hover:bg-surface-subtle"
                aria-label={t('common.close') ?? 'Close'}
              >
                ×
              </button>
            </div>
            <ZonesMapDialog selectedZoneKey={myZone.zone as 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'} />
          </div>
        </>
      )}
    </PageContainer>
  );
}
