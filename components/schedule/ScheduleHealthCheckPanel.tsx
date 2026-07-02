'use client';

import { useMemo } from 'react';
import type {
  ConstraintAnalysisResult,
  ConstraintAnalysisStatus,
  ConstraintRecommendation,
} from '@/lib/schedule/constraintAnalyzer';
import {
  computeScheduleHealthKpis,
  impossibleDaysFromAnalysis,
  type HealthLevel,
} from '@/lib/schedule/scheduleHealthKpis';

export type HealthCheckPhase = 'preview' | 'feasible' | 'decision' | 'impossible' | 'solving';

type Props = {
  analysis: ConstraintAnalysisResult;
  mainReason?: string | null;
  recommendedFix?: string | null;
  phase?: HealthCheckPhase;
  loading?: boolean;
  feasibleMessage?: string | null;
  formatDayLabel?: (date: string) => string;
  weekStart: string;
  t: (key: string) => string;
  onContinueAnyway?: () => void;
  onModifyConstraints?: () => void;
  onCancel?: () => void;
  onRunBestPossible?: () => void;
};

function statusClass(status: ConstraintAnalysisStatus): string {
  switch (status) {
    case 'FEASIBLE':
      return 'border-emerald-200 bg-emerald-50/60 text-emerald-950';
    case 'NEEDS_SUPPORT':
      return 'border-amber-200 bg-amber-50/60 text-amber-950';
    case 'IMPOSSIBLE':
      return 'border-red-200 bg-red-50/60 text-red-950';
  }
}

function kpiLevelClass(level: HealthLevel): string {
  switch (level) {
    case 'good':
      return 'text-emerald-800';
    case 'at_risk':
      return 'text-amber-800';
    case 'critical':
      return 'text-red-800';
  }
}

function KpiCard({
  title,
  value,
  detail,
  level,
}: {
  title: string;
  value: string;
  detail: string;
  level: HealthLevel;
}) {
  return (
    <div className="rounded-lg border border-current/10 bg-white/50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{title}</p>
      <p className={`mt-1 text-lg font-semibold ${kpiLevelClass(level)}`}>{value}</p>
      <p className="mt-0.5 text-xs opacity-75">{detail}</p>
    </div>
  );
}

function RecommendationList({ items }: { items: ConstraintRecommendation[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {items.map((rec) => (
        <li key={rec.type} className="rounded-lg border border-current/10 bg-white/40 px-3 py-2">
          <span className="font-semibold">
            {rec.rank}. {rec.label}
          </span>
          <span className="text-xs opacity-70"> · {rec.impact} impact</span>
          <p className="mt-0.5 text-xs opacity-85">{rec.explanation}</p>
          {rec.estimatedEffect && (
            <p className="mt-1 text-xs font-medium opacity-90">{rec.estimatedEffect}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ScheduleHealthCheckPanel({
  analysis,
  mainReason,
  recommendedFix,
  phase = 'preview',
  loading,
  feasibleMessage,
  formatDayLabel,
  weekStart,
  t,
  onContinueAnyway,
  onModifyConstraints,
  onCancel,
  onRunBestPossible,
}: Props) {
  const kpis = useMemo(() => computeScheduleHealthKpis(analysis), [analysis]);
  const { summary } = analysis;
  const missingSlots = Math.max(0, summary.requiredCoverageSlots - summary.availableCoverageSlots);
  const impossibleDays = impossibleDaysFromAnalysis(analysis);

  const showDecision = phase === 'decision' && analysis.status === 'NEEDS_SUPPORT';
  const showImpossibleGate = phase === 'impossible' && analysis.status === 'IMPOSSIBLE';

  return (
    <div className={`rounded-xl border p-4 ${statusClass(analysis.status)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {(t('schedule.v3.healthCheck.title') as string) || 'Schedule Health Check'}
          </h2>
          <p className="mt-0.5 text-xs opacity-80">
            {(t('schedule.v3.healthCheck.subtitle') as string) ||
              'Step 1 — review feasibility before running the solver.'}
          </p>
        </div>
        {loading && (
          <span className="text-xs font-medium opacity-70">{t('common.loading')}</span>
        )}
      </div>

      {feasibleMessage && phase === 'feasible' && (
        <p className="mt-3 rounded-lg border border-emerald-300/50 bg-white/50 px-3 py-2 text-sm font-medium">
          {feasibleMessage}
        </p>
      )}

      {phase === 'solving' && (
        <p className="mt-3 text-sm opacity-90">
          {(t('schedule.v3.healthCheck.continuingToSolve') as string) ||
            'Health check passed — running schedule solver…'}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title={(t('schedule.v3.healthCheck.coverageHealth') as string) || 'Coverage Health'}
          value={kpis.coverageHealth.label}
          detail={kpis.coverageHealth.detail}
          level={kpis.coverageHealth.level}
        />
        <KpiCard
          title={(t('schedule.v3.healthCheck.staffAvailability') as string) || 'Staff Availability'}
          value={kpis.staffAvailability.label}
          detail={kpis.staffAvailability.detail}
          level={kpis.staffAvailability.level}
        />
        <KpiCard
          title={(t('schedule.v3.healthCheck.constraintHealth') as string) || 'Constraint Health'}
          value={kpis.constraintHealth.label}
          detail={kpis.constraintHealth.detail}
          level={kpis.constraintHealth.level}
        />
        <KpiCard
          title={(t('schedule.v3.healthCheck.scheduleQuality') as string) || 'Schedule Quality'}
          value={kpis.scheduleQuality.label}
          detail={kpis.scheduleQuality.detail}
          level={kpis.scheduleQuality.level}
        />
        <KpiCard
          title={(t('schedule.v3.healthCheck.fairnessHealth') as string) || 'Fairness Health'}
          value={kpis.fairnessHealth.label}
          detail={kpis.fairnessHealth.detail}
          level={kpis.fairnessHealth.level}
        />
      </div>

      {showImpossibleGate && (
        <div className="mt-4 space-y-3 rounded-lg border border-red-300/40 bg-white/45 px-3 py-3">
          <p className="text-sm font-semibold">
            {(t('schedule.v3.healthCheck.impossibleTitle') as string) ||
              'This week cannot be fully covered with current constraints.'}
          </p>
          {analysis.insights.whyImpossible && (
            <p className="text-sm opacity-90">{analysis.insights.whyImpossible}</p>
          )}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium opacity-70">
                {(t('schedule.v3.healthCheck.whyImpossible') as string) || 'Why impossible'}
              </dt>
              <dd className="mt-0.5">{mainReason ?? analysis.issues[0]?.message}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium opacity-70">
                {(t('schedule.v3.healthCheck.missingHours') as string) || 'Missing hours'}
              </dt>
              <dd className="mt-0.5 font-semibold">{summary.missingStaffHours}h</dd>
            </div>
            <div>
              <dt className="text-xs font-medium opacity-70">
                {(t('schedule.v3.healthCheck.missingSlots') as string) || 'Missing coverage slots'}
              </dt>
              <dd className="mt-0.5 font-semibold">{missingSlots}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium opacity-70">
                {(t('schedule.v3.healthCheck.topRecommendation') as string) || 'Top recommendation'}
              </dt>
              <dd className="mt-0.5 font-medium">
                {recommendedFix ?? analysis.recommendations[0]?.label ?? '—'}
              </dd>
            </div>
          </dl>
          {impossibleDays.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {(t('schedule.v3.healthCheck.impossibleDays') as string) || 'Impossible days'}
              </p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {impossibleDays.map((date) => (
                  <li key={date}>
                    • {formatDayLabel ? formatDayLabel(date) : date}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {onRunBestPossible && (
              <button
                type="button"
                onClick={onRunBestPossible}
                disabled={loading}
                className="h-9 rounded-lg bg-red-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {(t('schedule.v3.healthCheck.runBestPossible') as string) ||
                  'Run best possible schedule anyway'}
              </button>
            )}
            {onModifyConstraints && (
              <button
                type="button"
                onClick={onModifyConstraints}
                className="h-9 rounded-lg border border-current/20 bg-white/60 px-4 text-sm font-semibold"
              >
                {(t('schedule.v3.healthCheck.modifyConstraints') as string) || 'Modify constraints'}
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="h-9 rounded-lg border border-transparent px-4 text-sm font-medium opacity-80 hover:opacity-100"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}

      {showDecision && (
        <div className="mt-4 space-y-3 rounded-lg border border-amber-300/40 bg-white/45 px-3 py-3">
          <p className="text-sm font-semibold">
            {(t('schedule.v3.healthCheck.needsSupportTitle') as string) ||
              'Coverage may need extra support before solving.'}
          </p>
          <RecommendationList items={analysis.recommendations.slice(0, 3)} />
          <div className="flex flex-wrap gap-2 pt-1">
            {onContinueAnyway && (
              <button
                type="button"
                onClick={onContinueAnyway}
                disabled={loading}
                className="h-9 rounded-lg bg-amber-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {(t('schedule.v3.healthCheck.continueAnyway') as string) || 'Continue anyway'}
              </button>
            )}
            {onModifyConstraints && (
              <button
                type="button"
                onClick={onModifyConstraints}
                className="h-9 rounded-lg border border-current/20 bg-white/60 px-4 text-sm font-semibold"
              >
                {(t('schedule.v3.healthCheck.modifyConstraints') as string) || 'Modify constraints'}
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="h-9 rounded-lg border border-transparent px-4 text-sm font-medium opacity-80 hover:opacity-100"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}

      {!showImpossibleGate && !showDecision && (mainReason || analysis.recommendations.length > 0) && (
        <div className="mt-4 rounded-lg border border-current/10 bg-white/40 px-3 py-2">
          {mainReason && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {(t('schedule.v3.healthCheck.summary') as string) || 'Summary'}
              </p>
              <p className="mt-1 text-sm">{mainReason}</p>
            </>
          )}
          {recommendedFix && (
            <p className="mt-2 text-xs">
              <span className="font-semibold">
                {(t('schedule.v3.healthCheck.recommendedFix') as string) || 'Recommended fix'}:{' '}
              </span>
              {recommendedFix}
            </p>
          )}
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-medium opacity-80">
          {(t('schedule.v3.healthCheck.technicalDetails') as string) || 'Technical Details'}
        </summary>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="opacity-70">Analysis status</dt>
            <dd className="font-mono font-semibold">{analysis.status}</dd>
          </div>
          <div>
            <dt className="opacity-70">External support would help</dt>
            <dd className="font-mono font-semibold">
              {analysis.insights.externalSupportWouldHelp ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="opacity-70">Overtime could help</dt>
            <dd className="font-mono font-semibold">
              {analysis.insights.overtimeCouldHelp ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="opacity-70">Move weekly off could help</dt>
            <dd className="font-mono font-semibold">
              {analysis.insights.moveWeeklyOffCouldHelp ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="opacity-70">Leave is main blocker</dt>
            <dd className="font-mono font-semibold">
              {analysis.insights.leaveIsMainBlocker ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="opacity-70">Reduce late coverage could help</dt>
            <dd className="font-mono font-semibold">
              {analysis.insights.reduceLateCoverageCouldHelp ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="opacity-70">Required coverage slots</dt>
            <dd className="font-mono font-semibold">{summary.requiredCoverageSlots}</dd>
          </div>
          <div>
            <dt className="opacity-70">Available coverage slots</dt>
            <dd className="font-mono font-semibold">{summary.availableCoverageSlots}</dd>
          </div>
          <div>
            <dt className="opacity-70">Staff pool</dt>
            <dd className="font-mono font-semibold">
              {summary.employeeCount} regular + {summary.externalSupportCount} support
            </dd>
          </div>
          <div>
            <dt className="opacity-70">Week</dt>
            <dd className="font-mono font-semibold">{weekStart}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

/** @deprecated Use ScheduleHealthCheckPanel */
export { ScheduleHealthCheckPanel as ScheduleAnalysisPanel };
