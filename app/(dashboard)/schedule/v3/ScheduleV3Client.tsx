'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { dateFromCalendarDayString, intlLocaleForGregorianCalendar } from '@/lib/i18n/format';
import { TechnicalAnalysisPanel } from '@/components/schedule/TechnicalAnalysisPanel';
import {
  ScheduleWeeklyGrid,
  ScheduleBottomSummary,
  ScheduleExplanation,
  buildExplanationFromData,
} from '@/components/schedule/ScheduleManagerView';
import { ScheduleCellDetailModal } from '@/components/schedule/ScheduleCellDetailModal';
import type { HealthCheckPhase } from '@/components/schedule/ScheduleHealthCheckPanel';
import type { SmartRecommendation } from '@/lib/schedule/recommendationEngine';
import type { WorkforcePlan } from '@/lib/schedule/resourcePlanner';
import type {
  SimulatedScenario,
  ScenarioSimulationSummary,
} from '@/lib/schedule/scenarioSimulator';
import type { ConstraintAnalysisResult } from '@/lib/schedule/constraintAnalyzer';
import type { ScheduleQualityMetrics } from '@/lib/schedule/scheduleUiMetrics';
import type { PlanAction } from '@/lib/services/schedulePlanner';
import type {
  ScheduleEnginePerfStats,
  ScheduleEngineStageTimings,
} from '@/lib/schedule/scheduleEnginePerf';
import {
  buildScheduleGrid,
  computeScheduleSummary,
} from '@/lib/schedule/schedulePresentation';
import type {
  DayOperatingConfig,
  EmployeeDayAssignment,
  GenerateScheduleResult,
  SlotViolation,
} from '@/lib/schedule/generateSchedule/types';

type AnalyzeResponse = {
  weekStart: string;
  guestShiftCount: number;
  analysis: ConstraintAnalysisResult;
  mainReason: string;
  recommendedFix: string | null;
  smartRecommendations?: SmartRecommendation[];
  workforcePlan?: WorkforcePlan;
};

type SolveMetrics = ScheduleQualityMetrics & { fairnessScore: number };

type ScenariosResponse = {
  weekStart: string;
  bestScenarioId: string;
  scenarios: SimulatedScenario[];
  summary: ScenarioSimulationSummary;
  generatedAt: string;
  performance: { scenariosGenerated: number; solves: number; totalMs: number; capped: boolean };
};

type SolveResponse = {
  weekStart: string;
  mode: 'normal' | 'ramadan';
  generateResult: GenerateScheduleResult;
  actions: PlanAction[];
  dayOperatingConfigs: DayOperatingConfig[];
  metrics: SolveMetrics;
  guestShiftCount: number;
  scenariosTried: number;
  timings?: ScheduleEngineStageTimings;
  stats?: ScheduleEnginePerfStats;
  smartRecommendations?: SmartRecommendation[];
};

type Props = {
  ramadanRange: { start: string; end: string } | null;
};

function weekStartSaturday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function parseWeekStart(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return weekStartSaturday(getRiyadhDateKey());
  return weekStartSaturday(value);
}

function weekOverlapsRamadan(
  weekStart: string,
  range: { start: string; end: string } | null
): boolean {
  if (!range) return false;
  const weekEnd = addDays(weekStart, 6);
  return weekStart <= range.end && weekEnd >= range.start;
}

function formatSolveError(
  status: number,
  data: { error?: string },
  t: (key: string) => string
): string {
  if (data.error) return data.error;
  if (status === 504) return (t('schedule.v3.gatewayTimeout') as string) || 'Gateway timeout (504). The server took too long.';
  if (status === 502 || status === 503) {
    return (t('schedule.v3.serverUnavailable') as string) || `Server unavailable (${status}). Try again.`;
  }
  return `Failed (${status})`;
}

function parseSolveResponseBody(raw: string): { error?: string } & Partial<SolveResponse> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Empty response');
  const jsonStart = trimmed.indexOf('{');
  const jsonText = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed;
  return JSON.parse(jsonText) as { error?: string } & Partial<SolveResponse>;
}

function formatPeriods(periods: DayOperatingConfig['operatingPeriods']): string {
  return periods.map((p) => `${p.startTime}–${p.endTime}`).join(', ');
}

function groupViolationsByDay(violations: SlotViolation[]): Map<string, SlotViolation[]> {
  const map = new Map<string, SlotViolation[]>();
  for (const v of violations) {
    map.set(v.date, [...(map.get(v.date) ?? []), v]);
  }
  return map;
}

export function ScheduleV3Client({ ramadanRange }: Props) {
  const { t, locale } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [weekStart, setWeekStart] = useState(() => parseWeekStart(searchParams.get('weekStart')));
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [analyzeData, setAnalyzeData] = useState<AnalyzeResponse | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [healthPhase, setHealthPhase] = useState<HealthCheckPhase>('preview');
  const [feasibleMessage, setFeasibleMessage] = useState<string | null>(null);
  const [solveData, setSolveData] = useState<SolveResponse | null>(null);
  const [scenarioData, setScenarioData] = useState<ScenariosResponse | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<EmployeeDayAssignment | null>(null);

  const intlLocale = intlLocaleForGregorianCalendar(locale);

  const syncWeekToUrl = useCallback(
    (ws: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('weekStart', ws);
      router.replace(`/schedule/v3?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const formatDayName = useCallback(
    (date: string) => {
      const d = dateFromCalendarDayString(date);
      return d.toLocaleDateString(intlLocale, { weekday: 'long' });
    },
    [intlLocale]
  );

  const formatDateShort = useCallback(
    (date: string) => {
      const d = dateFromCalendarDayString(date);
      return d.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
    },
    [intlLocale]
  );

  const weekRangeLabel = useMemo(() => {
    const start = dateFromCalendarDayString(weekStart);
    const end = dateFromCalendarDayString(addDays(weekStart, 6));
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${start.toLocaleDateString(intlLocale, opts)} – ${end.toLocaleDateString(intlLocale, opts)}`;
  }, [weekStart, intlLocale]);

  const assignmentsByDay = useMemo(() => {
    if (!solveData) return [];
    const dates = solveData.dayOperatingConfigs.map((d) => d.date);
    const byDate = new Map<string, EmployeeDayAssignment[]>();
    for (const a of solveData.generateResult.assignments) {
      if (a.shiftKind === 'Off') continue;
      byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
    }
    return dates.map((date) => ({
      date,
      assignments: (byDate.get(date) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [solveData]);

  const violationsByDay = useMemo(() => {
    if (!solveData?.generateResult.slotViolations.length) return [];
    const grouped = groupViolationsByDay(solveData.generateResult.slotViolations);
    return solveData.dayOperatingConfigs
      .map((d) => ({ date: d.date, violations: grouped.get(d.date) ?? [] }))
      .filter((d) => d.violations.length > 0);
  }, [solveData]);

  const qualityMetrics: ScheduleQualityMetrics | null = useMemo(() => {
    if (!solveData) return null;
    const m = solveData.metrics;
    return {
      coverageValid: m.coverageValid,
      slotViolationCount: m.slotViolationCount,
      splitCount: m.splitCount,
      overtimeCount: m.overtimeCount,
      externalSupportCount: m.externalSupportCount,
    };
  }, [solveData]);

  const scheduleGrid = useMemo(() => {
    if (!solveData) return [];
    return buildScheduleGrid(solveData.generateResult.assignments, solveData.dayOperatingConfigs);
  }, [solveData]);

  const scheduleSummary = useMemo(() => {
    if (!solveData) return null;
    return computeScheduleSummary(
      solveData.generateResult.assignments,
      solveData.dayOperatingConfigs,
      solveData.generateResult.slotViolations,
      solveData.generateResult.employeeSummaries,
      solveData.metrics.coverageValid
    );
  }, [solveData]);

  const explanationBullets = useMemo(() => {
    if (!solveData || !scheduleSummary) return [];
    return buildExplanationFromData(
      solveData.generateResult.assignments,
      solveData.dayOperatingConfigs,
      scheduleSummary
    );
  }, [solveData, scheduleSummary]);

  const smartRecommendations = useMemo(() => {
    if (solveData?.smartRecommendations?.length) return solveData.smartRecommendations;
    if (analyzeData?.smartRecommendations?.length) return analyzeData.smartRecommendations;
    return [];
  }, [solveData, analyzeData]);

  const fetchAnalysis = useCallback(async (): Promise<AnalyzeResponse | null> => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch('/api/schedule/v3/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      const data = (await res.json()) as AnalyzeResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `Analyze failed (${res.status})`);
      }
      if (!data.analysis) {
        throw new Error(
          (t('schedule.v3.healthCheck.invalidResponse') as string) || 'Invalid analyze response'
        );
      }
      setAnalyzeData(data);
      if (data.analysis.status === 'FEASIBLE') {
        setHealthPhase('feasible');
      } else if (data.analysis.status === 'NEEDS_SUPPORT') {
        setHealthPhase('decision');
      } else {
        setHealthPhase('impossible');
      }
      return data;
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Analyze failed');
      setAnalyzeData(null);
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, [weekStart, t]);

  const generateScenarios = useCallback(async () => {
    setScenarioLoading(true);
    setScenarioError(null);
    try {
      const res = await fetch('/api/schedule/v3/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      const data = (await res.json()) as ScenariosResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `Scenario simulation failed (${res.status})`);
      }
      setScenarioData(data);
    } catch (e) {
      setScenarioError(e instanceof Error ? e.message : 'Scenario simulation failed');
      setScenarioData(null);
    } finally {
      setScenarioLoading(false);
    }
  }, [weekStart]);

  const applyScenario = useCallback(
    (scenario: SimulatedScenario) => {
      if (!scenario.simulationResult.coverageValid) {
        const proceed = window.confirm(
          (t('schedule.v3.scenario.forceConfirm') as string) ||
            'This scenario does not reach full coverage. Open the editor to apply it anyway?'
        );
        if (!proceed) return;
      }
      router.push(`/schedule/edit?weekStart=${encodeURIComponent(weekStart)}`);
    },
    [router, weekStart, t]
  );

  const runSolveRequest = useCallback(
    async (opts: { forcePartialSolve?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      setApplyError(null);
      setSelectedCell(null);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 180_000);
      try {
        const res = await fetch('/api/schedule/v3/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStart,
            preAnalyzed: true,
            forcePartialSolve: opts.forcePartialSolve ?? true,
          }),
          signal: controller.signal,
        });
        const raw = await res.text();
        let data: SolveResponse & { error?: string };
        try {
          data = parseSolveResponseBody(raw) as SolveResponse & { error?: string };
        } catch {
          throw new Error(formatSolveError(res.status, {}, t));
        }
        if (data.error) throw new Error(data.error);
        if (!res.ok) throw new Error(formatSolveError(res.status, data, t));
        if (!data.generateResult || !data.metrics) {
          throw new Error((t('schedule.v3.invalidResponse') as string) || 'Invalid solve response');
        }
        setSolveData(data);
        setHealthPhase('preview');
        void fetchAnalysis();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setError((t('schedule.v3.timeout') as string) || 'Solve request timed out after 3 minutes.');
        } else {
          setError(e instanceof Error ? e.message : 'Solve failed');
        }
      } finally {
        window.clearTimeout(timeoutId);
        setLoading(false);
      }
    },
    [weekStart, t, fetchAnalysis]
  );

  const handleGenerateSchedule = useCallback(() => {
    setSolveData(null);
    setAnalyzeData(null);
    setScenarioData(null);
    setScenarioError(null);
    setFeasibleMessage(null);
    void runSolveRequest({ forcePartialSolve: true });
  }, [runSolveRequest]);

  const handleContinueAnyway = useCallback(() => {
    void runSolveRequest({ forcePartialSolve: true });
  }, [runSolveRequest]);

  const handleRunBestPossible = useCallback(() => {
    void runSolveRequest({ forcePartialSolve: true });
  }, [runSolveRequest]);

  const handleModifyConstraints = useCallback(() => {
    router.push(`/schedule/edit?weekStart=${encodeURIComponent(weekStart)}`);
  }, [router, weekStart]);

  const handleCancelDecision = useCallback(() => {
    setHealthPhase('preview');
    setFeasibleMessage(null);
  }, []);

  const applyToWeek = useCallback(async () => {
    if (!solveData?.actions.length) return;

    const incomplete = !solveData.metrics.coverageValid;
    if (incomplete) {
      const proceed = window.confirm(
        (t('schedule.v3.manager.applyIncompleteConfirm') as string) ||
          'Coverage is incomplete. Apply this schedule anyway?'
      );
      if (!proceed) return;
    }

    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch('/api/schedule/week/plan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: solveData.weekStart,
          reason: (t('schedule.v3.applyReason') as string) || 'Schedule Engine v3 solve',
          actions: solveData.actions,
          force: incomplete,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'COVERAGE_INVALID' && !incomplete) {
          setApplyError((t('schedule.v3.applyBlocked') as string) || data.error);
        } else {
          throw new Error((data.error as string) || `Failed (${res.status})`);
        }
        return;
      }
      router.push(`/schedule/edit?weekStart=${encodeURIComponent(solveData.weekStart)}`);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }, [solveData, t, router]);

  const changeWeek = (ws: string) => {
    setWeekStart(ws);
    syncWeekToUrl(ws);
    setSolveData(null);
    setAnalyzeData(null);
    setScenarioData(null);
    setScenarioError(null);
    setHealthPhase('preview');
    setFeasibleMessage(null);
    setError(null);
    setAnalyzeError(null);
    setApplyError(null);
    setSelectedCell(null);
  };

  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">{tr('schedule.v3.lab.bannerTitle', 'Engine Lab — for testing only')}</p>
          <p className="mt-1 text-amber-900/90">
            {tr(
              'schedule.v3.lab.bannerHint',
              'For day-to-day planning use Schedule Next: generate a proposal, review, approve, or edit manually.'
            )}
          </p>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          {tr('schedule.v3.lab.title', 'Schedule Engine Lab')}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {tr(
            'schedule.v3.lab.subtitle',
            'Experiment with Engine v3, constraint analysis, scenarios, and workforce planning.'
          )}
        </p>
        {ramadanRange && weekOverlapsRamadan(weekStart, ramadanRange) && (
          <p className="mt-1 text-xs text-sky-700">
            {t('schedule.v3.ramadanActive')} {ramadanRange.start} – {ramadanRange.end}
          </p>
        )}
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => changeWeek(addDays(weekStart, -7))}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-subtle"
          >
            {tr('schedule.v3.manager.previousWeek', 'Previous')}
          </button>
          <div className="px-2 text-center">
            <p className="text-xs font-medium text-muted">{tr('schedule.week', 'Week')}</p>
            <p className="text-sm font-semibold text-foreground">{weekRangeLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => changeWeek(addDays(weekStart, 7))}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-subtle"
          >
            {tr('schedule.v3.manager.nextWeek', 'Next')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerateSchedule()}
            disabled={loading || applying}
            className="h-10 rounded-lg bg-[#0F4C3A] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? tr('schedule.v3.manager.generating', 'Generating…')
              : tr('schedule.v3.generate', 'Generate Schedule')}
          </button>
          {solveData && solveData.actions.length > 0 && (
            <button
              type="button"
              onClick={() => void applyToWeek()}
              disabled={applying || loading}
              className="h-10 rounded-lg border border-[#0F4C3A] bg-surface px-5 text-sm font-semibold text-[#0F4C3A] disabled:opacity-50"
            >
              {applying
                ? tr('common.loading', 'Loading…')
                : tr('schedule.v3.apply', 'Apply Schedule')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void handleGenerateSchedule()}
            disabled={loading}
            className="shrink-0 text-xs font-medium text-red-800 underline disabled:opacity-50"
          >
            {t('common.refresh')}
          </button>
        </div>
      )}
      {applyError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {applyError}
        </div>
      )}

      {loading && !solveData && (
        <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            {tr('schedule.v3.manager.generatingSchedule', 'Generating your weekly schedule…')}
          </p>
          <p className="mt-1 text-xs text-muted">
            {tr('schedule.v3.manager.generatingHint', 'This usually takes a few seconds.')}
          </p>
        </div>
      )}

      {!loading && !solveData && (
        <div className="rounded-xl border border-dashed border-border bg-surface-subtle px-6 py-12 text-center">
          <p className="text-sm text-muted">
            {tr(
              'schedule.v3.manager.emptyState',
              'Select a week and press Generate Schedule to build the weekly roster.'
            )}
          </p>
        </div>
      )}

      {solveData && scheduleSummary && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-3 text-base font-semibold text-foreground">
              {tr('schedule.v3.manager.generatedSchedule', 'Generated Weekly Schedule')}
            </h2>
            <ScheduleWeeklyGrid
              rows={scheduleGrid}
              days={solveData.dayOperatingConfigs}
              onCellClick={setSelectedCell}
            />
          </section>

          <ScheduleBottomSummary summary={scheduleSummary} t={t} />
          <ScheduleExplanation bullets={explanationBullets} t={t} />

          <TechnicalAnalysisPanel
            t={t}
            weekStart={weekStart}
            analyzeData={analyzeData}
            analyzeError={analyzeError}
            analyzing={analyzing}
            healthPhase={healthPhase}
            feasibleMessage={feasibleMessage}
            loading={loading}
            formatDayName={formatDayName}
            formatDateShort={formatDateShort}
            smartRecommendations={smartRecommendations}
            scenarioData={scenarioData}
            scenarioLoading={scenarioLoading}
            scenarioError={scenarioError}
            onGenerateScenarios={() => void generateScenarios()}
            onApplyScenario={applyScenario}
            onContinueAnyway={handleContinueAnyway}
            onModifyConstraints={handleModifyConstraints}
            onCancelDecision={handleCancelDecision}
            onRunBestPossible={handleRunBestPossible}
            qualityMetrics={qualityMetrics}
            fairnessScore={solveData.metrics.fairnessScore}
            employeeSummaries={solveData.generateResult.employeeSummaries}
            mode={solveData.mode}
            scenariosTried={solveData.scenariosTried}
            dayOperatingConfigs={solveData.dayOperatingConfigs}
            formatPeriods={formatPeriods}
            violationsByDay={violationsByDay}
            assignmentsByDay={assignmentsByDay}
            timings={solveData.timings}
            stats={solveData.stats}
            warnings={solveData.generateResult.warnings}
          />
        </div>
      )}

      {selectedCell && (
        <ScheduleCellDetailModal assignment={selectedCell} onClose={() => setSelectedCell(null)} t={t} />
      )}
    </div>
  );
}
