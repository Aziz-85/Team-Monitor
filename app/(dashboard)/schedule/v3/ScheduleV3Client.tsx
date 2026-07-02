'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { dateFromCalendarDayString, intlLocaleForGregorianCalendar } from '@/lib/i18n/format';
import { ScheduleQualityPanel } from '@/components/schedule/ScheduleQualityPanel';
import type { ScheduleQualityMetrics } from '@/lib/schedule/scheduleUiMetrics';
import type { PlanAction } from '@/lib/services/schedulePlanner';
import type {
  ScheduleEnginePerfStats,
  ScheduleEngineStageTimings,
} from '@/lib/schedule/scheduleEnginePerf';
import type {
  DayOperatingConfig,
  EmployeeDayAssignment,
  GenerateScheduleResult,
  SlotViolation,
} from '@/lib/schedule/generateSchedule/types';

type SolveMetrics = ScheduleQualityMetrics & { fairnessScore: number };

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

/** Parse JSON from a keepalive stream (leading newlines before the payload). */
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

function AssignmentCell({ assignment }: { assignment: EmployeeDayAssignment }) {
  if (assignment.shiftKind === 'Off' || assignment.shiftKind === 'Leave') {
    return <span className="text-xs text-muted">{assignment.shiftKind}</span>;
  }
  if (!assignment.segments.length) {
    return <span className="text-xs font-medium text-foreground">{assignment.shiftKind}</span>;
  }
  return (
    <div className="space-y-0.5">
      {assignment.segments.map((s, i) => (
        <div key={`${s.startTime}-${i}`} className="font-mono text-xs text-foreground">
          {s.startTime}–{s.endTime}
        </div>
      ))}
    </div>
  );
}

export function ScheduleV3Client({ ramadanRange }: Props) {
  const { t, locale } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [weekStart, setWeekStart] = useState(() => parseWeekStart(searchParams.get('weekStart')));
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [solveData, setSolveData] = useState<SolveResponse | null>(null);

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
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
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

  const solve = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApplyError(null);
    setSolveData(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 180_000);
    try {
      const res = await fetch('/api/schedule/v3/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
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
  }, [weekStart, t]);

  const applyToWeek = useCallback(async () => {
    if (!solveData?.actions.length) return;
    if (!solveData.metrics.coverageValid) {
      setApplyError(t('schedule.v3.applyBlocked') as string);
      return;
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
          force: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'COVERAGE_INVALID') {
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
    setError(null);
    setApplyError(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {(t('schedule.v3.title') as string) || 'Schedule Solver'}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('schedule.v3.subtitle')}</p>
        {ramadanRange && weekOverlapsRamadan(weekStart, ramadanRange) && (
          <p className="mt-1 text-xs text-sky-700">
            {t('schedule.v3.ramadanActive')} {ramadanRange.start} – {ramadanRange.end}
          </p>
        )}
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <label className="text-xs font-medium text-muted">{t('schedule.weekStart')}</label>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeWeek(addDays(weekStart, -7))}
              className="h-9 rounded-lg border border-border px-2 text-sm hover:bg-surface-subtle"
              aria-label={t('schedule.previousWeek') as string}
            >
              ←
            </button>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => changeWeek(weekStartSaturday(e.target.value))}
              className="h-9 rounded-lg border border-border px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => changeWeek(addDays(weekStart, 7))}
              className="h-9 rounded-lg border border-border px-2 text-sm hover:bg-surface-subtle"
              aria-label={t('schedule.nextWeek') as string}
            >
              →
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">{weekRangeLabel}</p>
        </div>

        <div className="flex flex-wrap gap-2 ms-auto">
          <button
            type="button"
            onClick={() => void solve()}
            disabled={loading || applying}
            className="h-9 rounded-lg bg-[#0F4C3A] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('schedule.v3.solve')}
          </button>
          {solveData && solveData.actions.length > 0 && (
            <button
              type="button"
              onClick={() => void applyToWeek()}
              disabled={applying || loading || !solveData.metrics.coverageValid}
              title={
                !solveData.metrics.coverageValid
                  ? (t('schedule.v3.applyBlocked') as string)
                  : undefined
              }
              className="h-9 rounded-lg border border-[#0F4C3A] bg-surface px-4 text-sm font-semibold text-[#0F4C3A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? t('common.loading') : t('schedule.v3.apply')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void solve()}
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

      {!solveData && !loading && (
        <div className="rounded-xl border border-dashed border-border bg-surface-subtle px-6 py-12 text-center">
          <p className="text-sm text-muted">{t('schedule.v3.emptyState')}</p>
        </div>
      )}

      {loading && (
        <p className="text-sm text-muted">{t('schedule.v3.solving')}</p>
      )}

      {solveData && qualityMetrics && (
        <div className="space-y-6">
          <ScheduleQualityPanel
            metrics={qualityMetrics}
            fairnessScore={solveData.metrics.fairnessScore}
            t={t}
          />

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-foreground">{t('schedule.v3.operatingPeriods')}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {t('schedule.v3.mode')}: {solveData.mode} · {t('schedule.v3.scenariosTried')}:{' '}
              {solveData.scenariosTried}
            </p>
            <ul className="mt-3 space-y-1.5">
              {solveData.dayOperatingConfigs.map((day) => (
                <li key={day.date} className="flex flex-wrap gap-x-2 text-sm">
                  <span className="min-w-[7rem] font-medium text-foreground">
                    {formatDayName(day.date)}
                  </span>
                  <span className="font-mono text-foreground">{formatPeriods(day.operatingPeriods)}</span>
                  <span className="text-xs text-muted">({formatDateShort(day.date)})</span>
                </li>
              ))}
            </ul>
          </div>

          {violationsByDay.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h2 className="text-sm font-semibold text-amber-950">{t('schedule.v3.slotViolations')}</h2>
              <div className="mt-3 space-y-3">
                {violationsByDay.map(({ date, violations }) => (
                  <div key={date}>
                    <p className="text-xs font-semibold text-amber-900">
                      {formatDayName(date)} · {formatDateShort(date)} ({violations.length})
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {violations.map((v) => (
                        <li key={v.slotId} className="font-mono text-xs text-amber-950">
                          {v.startTime}–{v.endTime}: {v.coverage}/{v.minCoverage}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t('schedule.v3.scheduleByDay')}</h2>
              <span className="text-xs text-muted">
                {t('schedule.v3.changesCount')?.replace?.('{n}', String(solveData.actions.length)) ??
                  `${solveData.actions.length} changes`}
              </span>
            </div>

            <div className="mt-4 space-y-6">
              {assignmentsByDay.map(({ date, assignments }) => (
                <section key={date} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    {formatDayName(date)}{' '}
                    <span className="font-normal text-muted">({formatDateShort(date)})</span>
                  </h3>
                  {assignments.length === 0 ? (
                    <p className="mt-2 text-xs text-muted">{t('schedule.v3.noAssignments')}</p>
                  ) : (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {assignments.map((a) => (
                        <li
                          key={`${a.empId}-${a.date}`}
                          className="rounded-lg border border-border bg-surface-subtle px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{a.name}</span>
                            {a.splitDay && (
                              <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
                                Split
                              </span>
                            )}
                          </div>
                          <div className="mt-1">
                            <AssignmentCell assignment={a} />
                          </div>
                          {a.totalHours > 0 && (
                            <p className="mt-1 text-[10px] text-muted">
                              {a.totalHours.toFixed(1)}h
                              {a.isExternalSupport ? ` · ${t('schedule.externalCoverage')}` : ''}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </div>

          {solveData.timings && (
            <details className="rounded-xl border border-dashed border-border bg-surface-subtle p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Engine performance (dev)
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-muted">Timings (ms)</p>
                  <ul className="mt-1 space-y-0.5 font-mono text-xs">
                    {Object.entries(solveData.timings).map(([key, ms]) => (
                      <li key={key}>
                        {key}: {typeof ms === 'number' ? ms.toFixed(1) : ms}
                      </li>
                    ))}
                  </ul>
                </div>
                {solveData.stats && (
                  <div>
                    <p className="text-xs font-semibold text-muted">Stats</p>
                    <ul className="mt-1 space-y-0.5 font-mono text-xs">
                      {Object.entries(solveData.stats).map(([key, val]) => (
                        <li key={key}>
                          {key}:{' '}
                          {typeof val === 'object' && val !== null
                            ? JSON.stringify(val)
                            : String(val ?? '—')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}

          {solveData.generateResult.warnings.length > 0 && (
            <details className="rounded-xl border border-border bg-surface-subtle p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                {t('schedule.v3.engineWarnings')} ({solveData.generateResult.warnings.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {solveData.generateResult.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
