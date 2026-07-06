'use client';

import { ScheduleQualityPanel } from '@/components/schedule/ScheduleQualityPanel';
import {
  ScheduleHealthCheckPanel,
  type HealthCheckPhase,
} from '@/components/schedule/ScheduleHealthCheckPanel';
import { SmartRecommendationsPanel } from '@/components/schedule/SmartRecommendationsPanel';
import { WorkforcePlanningPanel } from '@/components/schedule/WorkforcePlanningPanel';
import { PlannerScheduleSummary } from '@/components/schedule/PlannerScheduleSummary';
import { ScenarioSimulatorPanel } from '@/components/schedule/ScenarioSimulatorPanel';
import type { SmartRecommendation } from '@/lib/schedule/recommendationEngine';
import type { WorkforcePlan } from '@/lib/schedule/resourcePlanner';
import type {
  SimulatedScenario,
  ScenarioSimulationSummary,
} from '@/lib/schedule/scenarioSimulator';
import type { ConstraintAnalysisResult } from '@/lib/schedule/constraintAnalyzer';
import type { ScheduleQualityMetrics } from '@/lib/schedule/scheduleUiMetrics';
import type {
  DayOperatingConfig,
  EmployeeDayAssignment,
  SlotViolation,
} from '@/lib/schedule/generateSchedule/types';
import type {
  ScheduleEnginePerfStats,
  ScheduleEngineStageTimings,
} from '@/lib/schedule/scheduleEnginePerf';
import type { EmployeeWeekSummary } from '@/lib/schedule/generateSchedule/types';

type Props = {
  t: (key: string) => string;
  weekStart: string;
  analyzeData: {
    analysis: ConstraintAnalysisResult;
    mainReason: string;
    recommendedFix: string | null;
    workforcePlan?: WorkforcePlan;
  } | null;
  analyzeError: string | null;
  analyzing: boolean;
  healthPhase: HealthCheckPhase;
  feasibleMessage: string | null;
  loading: boolean;
  formatDayName: (date: string) => string;
  formatDateShort: (date: string) => string;
  smartRecommendations: SmartRecommendation[];
  scenarioData: {
    scenarios: SimulatedScenario[];
    bestScenarioId: string;
    summary: ScenarioSimulationSummary;
  } | null;
  scenarioLoading: boolean;
  scenarioError: string | null;
  onGenerateScenarios: () => void;
  onApplyScenario: (scenario: SimulatedScenario) => void;
  onContinueAnyway: () => void;
  onModifyConstraints: () => void;
  onCancelDecision: () => void;
  onRunBestPossible: () => void;
  qualityMetrics: ScheduleQualityMetrics | null;
  fairnessScore: number;
  employeeSummaries: EmployeeWeekSummary[];
  mode: string;
  scenariosTried: number;
  dayOperatingConfigs: DayOperatingConfig[];
  formatPeriods: (periods: DayOperatingConfig['operatingPeriods']) => string;
  violationsByDay: { date: string; violations: SlotViolation[] }[];
  assignmentsByDay: { date: string; assignments: EmployeeDayAssignment[] }[];
  timings?: ScheduleEngineStageTimings;
  stats?: ScheduleEnginePerfStats;
  warnings: string[];
};

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

export function TechnicalAnalysisPanel({
  t,
  weekStart,
  analyzeData,
  analyzeError,
  analyzing,
  healthPhase,
  feasibleMessage,
  loading,
  formatDayName,
  formatDateShort,
  smartRecommendations,
  scenarioData,
  scenarioLoading,
  scenarioError,
  onGenerateScenarios,
  onApplyScenario,
  onContinueAnyway,
  onModifyConstraints,
  onCancelDecision,
  onRunBestPossible,
  qualityMetrics,
  fairnessScore,
  employeeSummaries,
  mode,
  scenariosTried,
  dayOperatingConfigs,
  formatPeriods,
  violationsByDay,
  assignmentsByDay,
  timings,
  stats,
  warnings,
}: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  const formatDayLabel = (date: string) => `${formatDayName(date)} (${formatDateShort(date)})`;

  return (
    <details className="rounded-xl border border-border bg-surface-subtle/40">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-muted hover:text-foreground">
        ▼ {tr('schedule.v3.manager.technicalAnalysis', 'Technical Analysis')}
      </summary>

      <div className="space-y-6 border-t border-border px-4 pb-4 pt-4">
        {analyzeError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {analyzeError}
          </div>
        )}

        {(analyzeData || analyzing) && (
          <div>
            {analyzeData ? (
              <ScheduleHealthCheckPanel
                analysis={analyzeData.analysis}
                mainReason={analyzeData.mainReason}
                recommendedFix={analyzeData.recommendedFix}
                phase={loading ? 'solving' : healthPhase}
                loading={analyzing || loading}
                feasibleMessage={feasibleMessage}
                formatDayLabel={formatDayLabel}
                weekStart={weekStart}
                t={t}
                onContinueAnyway={onContinueAnyway}
                onModifyConstraints={onModifyConstraints}
                onCancel={onCancelDecision}
                onRunBestPossible={onRunBestPossible}
              />
            ) : (
              <p className="text-sm text-muted">{t('schedule.v3.healthCheck.loading')}</p>
            )}
          </div>
        )}

        {analyzeData?.workforcePlan && (
          <WorkforcePlanningPanel plan={analyzeData.workforcePlan} formatDayLabel={formatDayLabel} t={t} />
        )}

        {analyzeData && analyzeData.analysis.status !== 'FEASIBLE' && (
          <div>
            {!scenarioData ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-200 bg-purple-50/50 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-purple-950">
                    {tr('schedule.v3.scenario.title', 'Scenario Simulator')}
                  </h2>
                  <p className="mt-0.5 text-xs text-purple-900/80">
                    {tr(
                      'schedule.v3.scenario.prompt',
                      'Simulate alternative workforce strategies and compare ranked options.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onGenerateScenarios}
                  disabled={scenarioLoading}
                  className="rounded-md border border-purple-300 bg-surface px-3 py-1.5 text-xs font-medium text-purple-900 hover:bg-purple-50 disabled:opacity-60"
                >
                  {scenarioLoading
                    ? tr('schedule.v3.scenario.generating', 'Generating options…')
                    : tr('schedule.v3.scenario.generate', 'Generate Options')}
                </button>
              </div>
            ) : (
              <ScenarioSimulatorPanel
                scenarios={scenarioData.scenarios}
                bestScenarioId={scenarioData.bestScenarioId}
                summary={scenarioData.summary}
                formatDayLabel={formatDayLabel}
                onApply={onApplyScenario}
                t={t}
              />
            )}
            {scenarioError && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {scenarioError}
              </p>
            )}
          </div>
        )}

        {smartRecommendations.length > 0 && (
          <SmartRecommendationsPanel
            recommendations={smartRecommendations}
            formatDayLabel={formatDayLabel}
            editWeekUrl={`/schedule/edit?weekStart=${encodeURIComponent(weekStart)}`}
            t={t}
          />
        )}

        {qualityMetrics && (
          <ScheduleQualityPanel metrics={qualityMetrics} rawFairnessScore={fairnessScore} t={t} />
        )}

        {employeeSummaries.length > 0 && (
          <PlannerScheduleSummary summaries={employeeSummaries} t={t} />
        )}

        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground">{t('schedule.v3.operatingPeriods')}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {t('schedule.v3.mode')}: {mode} · {t('schedule.v3.scenariosTried')}: {scenariosTried}
          </p>
          <ul className="mt-3 space-y-1.5">
            {dayOperatingConfigs.map((day) => (
              <li key={day.date} className="flex flex-wrap gap-x-2 text-sm">
                <span className="min-w-[7rem] font-medium text-foreground">{formatDayName(day.date)}</span>
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
          <h2 className="text-sm font-semibold text-foreground">{t('schedule.v3.scheduleByDay')}</h2>
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
                          {a.shiftKind === 'Bridge' && (
                            <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-900">
                              Bridge
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <AssignmentCell assignment={a} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>

        {timings && (
          <div className="rounded-xl border border-dashed border-border bg-surface-subtle p-4">
            <p className="text-sm font-medium text-foreground">Engine performance</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted">Timings (ms)</p>
                <ul className="mt-1 space-y-0.5 font-mono text-xs">
                  {Object.entries(timings).map(([key, ms]) => (
                    <li key={key}>
                      {key}: {typeof ms === 'number' ? ms.toFixed(1) : ms}
                    </li>
                  ))}
                </ul>
              </div>
              {stats && (
                <div>
                  <p className="text-xs font-semibold text-muted">Stats</p>
                  <ul className="mt-1 space-y-0.5 font-mono text-xs">
                    {Object.entries(stats).map(([key, val]) => (
                      <li key={key}>
                        {key}:{' '}
                        {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '—')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-xl border border-border bg-surface-subtle p-4">
            <p className="text-sm font-medium text-foreground">
              {t('schedule.v3.engineWarnings')} ({warnings.length})
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
