'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { useT } from '@/lib/i18n/useT';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { ZonesMapDialog } from '@/components/inventory/ZonesMapDialog';
import { getZoneBadgeClasses } from '@/lib/zones';
import { CoverageStatusCard } from '@/components/dashboard/home/CoverageStatusCard';
import { ShiftSnapshotCard } from '@/components/dashboard/home/ShiftSnapshotCard';
import { KeyHolderCard } from '@/components/dashboard/home/KeyHolderCard';
import { TasksTodayCard } from '@/components/dashboard/home/TasksTodayCard';
import { OperationalAlertsCard } from '@/components/dashboard/home/OperationalAlertsCard';
import { ComplianceExpiryCard } from '@/components/dashboard/home/ComplianceExpiryCard';
import { CardShell } from '@/components/dashboard/cards/CardShell';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { formatSarInt } from '@/lib/utils/money';
import Link from 'next/link';
import {
  EmptyStateBlock,
  PageContainer,
  SectionBlock,
} from '@/components/ui/ExecutiveIntelligence';
import { paceSignal } from '@/lib/presentation/executiveIntelligence';
import { useQuickActions } from '@/lib/nav/useQuickActions';
import { DAILY_SALES_LEDGER_HREF, QUICK_ACTION_DEFS } from '@/lib/nav/quickActions';
import { Button } from '@/components/ui/Button';
import { CoverageWarningSummary } from '@/components/schedule/CoverageWarningSummary';
import {
  formatCoverageWarnings,
  warningsFromValidationResults,
  warningsFromWeekSummary,
} from '@/lib/schedule/coverageWarningFormatter';
import type { QuickActionKey } from '@/lib/nav/quickActions';

function HomeActionIcon({ action }: { action: QuickActionKey }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (action === 'schedule') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path {...common} d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" /></svg>;
  }
  if (action === 'tasks') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path {...common} d="m5 7 2 2 4-4M13 7h6M5 15l2 2 4-4m2 2h6" /></svg>;
  }
  if (action === 'dailySalesLedger') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path {...common} d="M5 3h14v18H5zM8 7h8m-8 4h3m2 0h3m-8 4h3m2 0h3" /></svg>;
  }
  if (action === 'salesSummary' || action === 'executive' || action === 'dashboard') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path {...common} d="M4 19V9m6 10V5m6 14v-7m4 7H2" /></svg>;
  }
  if (action === 'targets') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><circle {...common} cx="12" cy="12" r="8" /><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="m14 10 6-6" /></svg>;
  }
  if (action === 'inventoryDaily') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path {...common} d="m4 8 8-4 8 4-8 4-8-4Zm0 0v8l8 4 8-4V8m-8 4v8" /></svg>;
  }
  return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path {...common} d="M4 6h16M4 12h16M4 18h10" /></svg>;
}

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
  hasMonthlyTarget?: boolean;
  monthlyTargetSar?: number | null;
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
  canOpenDailySalesLedger?: boolean;
};

export function HomePageClient({
  myZone,
  boutiqueName = '',
  canOpenDailySalesLedger = false,
}: HomePageClientProps) {
  const { t } = useT();
  const { actions: quickActions, track: trackQuickAction } = useQuickActions(5);
  const ledgerQuickAction = QUICK_ACTION_DEFS.find((a) => a.key === 'dailySalesLedger');
  const visibleQuickActions = useMemo(() => {
    if (!canOpenDailySalesLedger || !ledgerQuickAction) return quickActions;
    const rest = quickActions.filter((a) => a.key !== 'dailySalesLedger');
    return [ledgerQuickAction, ...rest].slice(0, 5);
  }, [canOpenDailySalesLedger, ledgerQuickAction, quickActions]);
  const secondaryQuickActions = useMemo(
    () => visibleQuickActions.filter((action) => action.key !== 'dailySalesLedger').slice(0, 4),
    [visibleQuickActions]
  );
  const [data, setData] = useState<HomeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState(() => getRiyadhDateKey());
  const [weekSummary, setWeekSummary] = useState<Array<{
    date: string;
    dayName: string;
    messages: string[];
    validations?: ValidationResult[];
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
            validations: d.coverageValidation ?? [],
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

  const coverageValidation = useMemo<ValidationResult[]>(
    () => data?.coverageValidation ?? [],
    [data?.coverageValidation]
  );
  const coverageSuggestion = data?.coverageSuggestion ?? null;
  const coverageSuggestionExplanation = data?.coverageSuggestionExplanation;

  const todayCoverageFormatted = useMemo(
    () => formatCoverageWarnings(warningsFromValidationResults(date, coverageValidation)),
    [date, coverageValidation]
  );

  const weekCoverageFormatted = useMemo(() => {
    const warnings = weekSummary.flatMap((d) =>
      d.validations?.length
        ? warningsFromValidationResults(d.date, d.validations, { dayName: d.dayName })
        : warningsFromWeekSummary([d])
    );
    return formatCoverageWarnings(warnings);
  }, [weekSummary]);

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

  const totalWarnings =
    (todayCoverageFormatted.totalAffectedDays > 0 ? 1 : 0) +
    (weekCoverageFormatted.totalAffectedDays > 0 ? 1 : 0) +
    complianceAlerts.length;
  const tasksTotal = myTodayTasks?.length ?? 0;
  const tasksCompleted = myTodayTasks?.filter((tt) => tt.isCompleted).length ?? 0;
  const taskCompletionPct = tasksTotal > 0 ? Math.round((tasksCompleted * 100) / tasksTotal) : 100;
  const weekCoveragePct = Math.round(
    ((7 - Math.min(7, weekCoverageFormatted.totalAffectedDays)) * 100) / 7
  );
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
                validations: d.coverageValidation ?? [],
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
    <PageContainer className="overflow-x-hidden space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface)_52%,var(--surface-subtle)_135%)] text-foreground shadow-[0_24px_70px_-42px_rgba(15,23,42,.35)]">
        <div className="pointer-events-none absolute -end-24 -top-32 h-96 w-96 rounded-full border border-accent/10 bg-accent/[.035]" />
        <div className="pointer-events-none absolute bottom-0 start-1/3 h-44 w-44 rounded-full bg-accent/[.06] blur-3xl" />
        <div className="relative p-5 md:p-7 lg:p-8">
          <div className="flex flex-col gap-6 border-b border-border/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-accent">Today at your boutique</p>
              <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight md:text-3xl">
                {boutiqueName || t('nav.dashboard')}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{heroTitle}</span>
                <span className="h-1 w-1 rounded-full bg-accent" />
                <span>{heroHint}</span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[28rem]">
              <div className="grid gap-2 sm:grid-cols-2">
                {canOpenDailySalesLedger && (
                  <Link
                    href={DAILY_SALES_LEDGER_HREF}
                    onClick={() => trackQuickAction('dailySalesLedger')}
                    className="group flex min-h-16 items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><HomeActionIcon action="dailySalesLedger" /></span>
                    <span className="min-w-0">
                      <strong className="block text-sm font-bold">Daily Sales Ledger</strong>
                      <span className="block text-[11px] text-white/75">Enter and review today&apos;s sales</span>
                    </span>
                    <span className="ms-auto transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  onClick={() => trackQuickAction('dashboard')}
                  className="group flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-foreground shadow-sm transition hover:border-accent/30 hover:bg-surface-subtle"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><HomeActionIcon action="dashboard" /></span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-bold">Open Dashboard</strong>
                    <span className="block text-[11px] text-muted">Explore performance and trends</span>
                  </span>
                  <span className="ms-auto transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
                </Link>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="sr-only" htmlFor="home-date">{t('common.date')}</label>
                <input
                  id="home-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 rounded-xl border border-border bg-surface px-3 text-xs text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
                />
                <span className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-semibold ${myZone ? getZoneBadgeClasses(myZone.zone) : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'}`}>
                  {myZoneBadgeText}
                </span>
                {myZone && <button type="button" onClick={() => setZoneDialogOpen(true)} className="h-9 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-subtle">{t('inventory.openMap')}</button>}
              </div>
            </div>
          </div>

          <div className="grid gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: t('home.executive.primaryTargetPct'), value: performance ? `${Math.max(0, Math.round(pace))}%` : '—', note: paceUi.shortLabel, accent: 'bg-accent', featured: true },
              { label: t('home.todayTasksTitle'), value: `${tasksCompleted}/${tasksTotal}`, note: `${taskCompletionPct}% complete`, accent: 'bg-emerald-500', featured: false },
              { label: t('home.coverageStatus'), value: `${weekCoveragePct}%`, note: weekCoverageFormatted.totalAffectedDays > 0 ? `${weekCoverageFormatted.totalAffectedDays} days need attention` : t('home.allClear'), accent: 'bg-sky-500', featured: false },
              { label: t('home.operationalAlerts'), value: String(totalWarnings), note: totalWarnings > 0 ? 'Items need attention' : t('home.allClear'), accent: totalWarnings > 0 ? 'bg-amber-500' : 'bg-emerald-500', featured: false },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl border border-border/70 bg-surface p-4 shadow-sm ${item.featured ? 'sm:col-span-2 xl:col-span-2' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">{item.label}</p>
                  <span className={`h-2 w-2 rounded-full ${item.accent}`} />
                </div>
                <div className="mt-3 flex items-end gap-4">
                  <p className={`${item.featured ? 'text-4xl md:text-5xl' : 'text-2xl'} font-semibold tabular-nums tracking-tight`}>{item.value}</p>
                  {item.featured && <div className="mb-2 h-1.5 flex-1 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pace))}%` }} /></div>}
                </div>
                <p className="mt-1 truncate text-xs text-muted">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-actions-heading">
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Navigate</p>
            <h2 id="quick-actions-heading" className="mt-1 text-lg font-semibold text-foreground">{t('home.quickActionsTitle')}</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {secondaryQuickActions.map((a, index) => (
            <Link
              key={a.key}
              href={a.href}
              onClick={() => trackQuickAction(a.key)}
              className={`group relative min-h-28 overflow-hidden rounded-2xl border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${index === 0 ? 'border-accent/30 bg-accent text-white' : 'border-border bg-surface text-foreground hover:border-accent/30'}`}
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${index === 0 ? 'bg-white/15 text-white' : 'bg-accent-soft text-accent'}`}>
                <HomeActionIcon action={a.key} />
              </span>
              <div className="mt-4 flex items-end justify-between gap-2">
                <span className="text-sm font-semibold leading-tight">{t(a.titleKey)}</span>
                <span className={`text-lg transition-transform group-hover:translate-x-0.5 ${index === 0 ? 'text-white/70' : 'text-muted'}`} aria-hidden>→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <SectionBlock
        title="Today's Operations"
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
              selectedDayMessage={todayCoverageFormatted.summaryLine}
              weekWarningCount={weekCoverageFormatted.totalAffectedDays}
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
                ...(weekCoverageFormatted.summaryLine
                  ? [
                      {
                        key: 'coverage-week',
                        label: t('coverage.title') as string,
                        value: weekCoverageFormatted.summaryLine,
                        severity: 'warn' as const,
                      },
                    ]
                  : []),
                ...(todayCoverageFormatted.summaryLine &&
                todayCoverageFormatted.summaryLine !== weekCoverageFormatted.summaryLine
                  ? [
                      {
                        key: 'coverage-today',
                        label: t('home.selectedDay') as string,
                        value: todayCoverageFormatted.summaryLine,
                        severity: 'warn' as const,
                      },
                    ]
                  : []),
                ...(coverageSuggestionExplanation &&
                !coverageSuggestion &&
                coverageValidation.some((v) => v.type === 'AM_GT_PM')
                  ? [
                      {
                        key: 'explain',
                        label: 'Note',
                        value: String(coverageSuggestionExplanation),
                        severity: 'info' as const,
                      },
                    ]
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
          {weekCoverageFormatted.summaryLine && (
            <CardShell variant="home">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                {t('coverage.weekSummary')}
              </h3>
              <CoverageWarningSummary
                formatted={weekCoverageFormatted}
                maxCompactLines={1}
                viewDetailsLabel={(t('schedule.warnings.showDetails') as string) || 'View details'}
                hideDetailsLabel={(t('schedule.warnings.hideDetails') as string) || 'Hide details'}
              >
                {weekSummary.some((d) => d.suggestion) && (
                  <ul className="mt-2 space-y-2 border-t border-amber-200/80 pt-2">
                    {weekSummary
                      .filter((d) => d.suggestion)
                      .map((d) => (
                        <li key={d.date} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-amber-950">
                            {d.dayName}:{' '}
                            {(t('coverage.moveSuggestion') as string).replace(
                              '{name}',
                              d.suggestion!.employeeName
                            )}
                          </span>
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
                                const weekRes = await fetch(`/api/schedule/week?weekStart=${ws}`, {
                                  cache: 'no-store',
                                });
                                const weekJson = await weekRes.json().catch(() => null);
                                if (weekJson?.days) {
                                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                                  setWeekSummary(
                                    weekJson.days
                                      .filter(
                                        (day: { coverageValidation?: ValidationResult[] }) =>
                                          day.coverageValidation?.length
                                      )
                                      .map(
                                        (day: {
                                          date: string;
                                          coverageValidation: ValidationResult[];
                                          coverageSuggestion?: { empId: string; employeeName: string } | null;
                                        }) => ({
                                          date: day.date,
                                          dayName:
                                            dayNames[new Date(day.date + 'T12:00:00Z').getUTCDay()],
                                          messages: (day.coverageValidation ?? []).map(
                                            (v: ValidationResult) => v.message
                                          ),
                                          validations: day.coverageValidation ?? [],
                                          suggestion: day.coverageSuggestion ?? null,
                                        })
                                      )
                                  );
                                }
                              }
                            }}
                            className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
                          >
                            {t('coverage.applySuggestion')}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </CoverageWarningSummary>
            </CardShell>
          )}
        </div>
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
