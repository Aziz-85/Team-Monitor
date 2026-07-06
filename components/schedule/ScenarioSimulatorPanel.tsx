'use client';

import { useState } from 'react';
import type {
  SimulatedScenario,
  ScenarioSimulationSummary,
} from '@/lib/schedule/scenarioSimulator';

type Props = {
  scenarios: SimulatedScenario[];
  bestScenarioId: string;
  summary: ScenarioSimulationSummary;
  formatDayLabel?: (date: string) => string;
  onApply: (scenario: SimulatedScenario) => void;
  t: (key: string) => string;
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

function ScoreBar({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 85 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="w-8 shrink-0 text-right text-[11px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ScenarioPreviewModal({
  scenario,
  formatDayLabel,
  onClose,
  t,
}: {
  scenario: SimulatedScenario;
  formatDayLabel?: (date: string) => string;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  const r = scenario.simulationResult;
  const byDate = new Map<string, typeof scenario.previewAssignments>();
  scenario.previewAssignments.forEach((a) => {
    byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  });
  const dates = Array.from(byDate.keys()).sort();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{scenario.title}</h3>
            <p className="mt-0.5 text-xs text-muted">{scenario.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-subtle"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-center">
            <div className="text-[10px] uppercase text-muted">{tr('schedule.v3.scenario.score', 'Score')}</div>
            <div className="text-sm font-semibold">{scenario.score}%</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-center">
            <div className="text-[10px] uppercase text-muted">{tr('schedule.v3.scenario.coverage', 'Coverage')}</div>
            <div className="text-sm font-semibold">{r.coverageValid ? '100%' : `${r.slotViolations} gaps`}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-center">
            <div className="text-[10px] uppercase text-muted">{tr('schedule.v3.scenario.overtime', 'Overtime')}</div>
            <div className="text-sm font-semibold">{r.overtimeHours}h</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-center">
            <div className="text-[10px] uppercase text-muted">{tr('schedule.v3.scenario.support', 'Support')}</div>
            <div className="text-sm font-semibold">{r.externalSupportHours}h</div>
          </div>
        </div>

        {scenario.affectedDays.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            <span className="font-medium text-foreground">{tr('schedule.v3.scenario.affectedDays', 'Affected days')}: </span>
            {scenario.affectedDays.map((d) => (formatDayLabel ? formatDayLabel(d) : d)).join(', ')}
          </p>
        )}

        <h4 className="mt-4 text-xs font-semibold text-foreground">
          {tr('schedule.v3.scenario.segments', 'Day / employee segments')}
        </h4>
        <div className="mt-1 space-y-2">
          {dates.length === 0 && (
            <p className="text-xs text-muted">{tr('schedule.v3.scenario.noAssignments', 'No assignments produced.')}</p>
          )}
          {dates.map((date) => (
            <div key={date} className="rounded-lg border border-border p-2">
              <p className="text-xs font-semibold text-foreground">
                {formatDayLabel ? formatDayLabel(date) : date}
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px]">
                {(byDate.get(date) ?? []).map((a, i) => (
                  <li key={`${a.empId}-${i}`} className="flex flex-wrap items-center gap-1">
                    <span className="font-medium">{a.name}</span>
                    {a.isExternalSupport && (
                      <span className="rounded bg-purple-100 px-1 text-[9px] font-semibold uppercase text-purple-700">
                        {tr('schedule.v3.scenario.supportTag', 'support')}
                      </span>
                    )}
                    {a.splitDay && (
                      <span className="rounded bg-teal-100 px-1 text-[9px] font-semibold uppercase text-teal-700">
                        {tr('schedule.v3.scenario.bridgeTag', 'bridge/split')}
                      </span>
                    )}
                    <span className="font-mono text-muted">
                      {a.segments.map((s) => `${s.startTime}–${s.endTime}`).join(' + ')} ({a.totalHours}h)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {scenario.compensationLedger.length > 0 && (
          <>
            <h4 className="mt-4 text-xs font-semibold text-foreground">
              {tr('schedule.v3.scenario.compensation', 'Compensation ledger')}
            </h4>
            <table className="mt-1 w-full text-left text-[11px]">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 pe-2 font-medium">{tr('schedule.v3.scenario.employee', 'Employee')}</th>
                  <th className="py-1 pe-2 font-medium">{tr('schedule.v3.scenario.bridge', 'Bridge')}</th>
                  <th className="py-1 pe-2 font-medium">{tr('schedule.v3.scenario.overtime', 'Overtime')}</th>
                  <th className="py-1 pe-2 font-medium">{tr('schedule.v3.scenario.owed', 'Owed')}</th>
                </tr>
              </thead>
              <tbody>
                {scenario.compensationLedger.map((e) => (
                  <tr key={e.employeeId} className="border-t border-border">
                    <td className="py-1 pe-2">{e.name}</td>
                    <td className="py-1 pe-2 font-mono">{e.bridgeShifts}</td>
                    <td className="py-1 pe-2 font-mono">{e.overtimeHours}h</td>
                    <td className="py-1 pe-2 font-mono font-semibold">{e.compensationOwedHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {scenario.remainingViolations.length > 0 && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {tr('schedule.v3.scenario.remainingGaps', 'Remaining coverage gaps')}:{' '}
            {scenario.remainingViolations.length}{' '}
            {tr('schedule.v3.scenario.slots', 'slot(s)')}
          </p>
        )}
      </div>
    </div>
  );
}

export function ScenarioSimulatorPanel({
  scenarios,
  bestScenarioId,
  summary,
  formatDayLabel,
  onApply,
  t,
}: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [explainId, setExplainId] = useState<string | null>(null);

  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  if (scenarios.length === 0) return null;

  const previewScenario = scenarios.find((s) => s.id === previewId) ?? null;

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-purple-950">
          {tr('schedule.v3.scenario.title', 'Scenario Simulator')}
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-purple-900/70">
          {tr('schedule.v3.scenario.subtitle', 'Ranked workforce options · simulated, nothing applied')}
        </span>
      </div>
      <p className="mt-1 text-xs text-purple-900/80">{summary.recommendation}</p>

      <ol className="mt-4 space-y-3">
        {scenarios.map((s, index) => {
          const isBest = s.id === bestScenarioId;
          const explaining = explainId === s.id;
          return (
            <li
              key={s.id}
              className={`rounded-xl border bg-surface p-3 ${isBest ? 'border-purple-400 ring-1 ring-purple-300' : 'border-border'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {tr('schedule.v3.scenario.option', 'Option')} {OPTION_LETTERS[index] ?? index + 1}
                    {isBest && (
                      <span className="ms-2 rounded bg-purple-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                        {tr('schedule.v3.scenario.best', 'Best overall')}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{s.title}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-purple-700">{s.score}%</div>
                  <div className="text-[10px] uppercase text-muted">{tr('schedule.v3.scenario.score', 'Score')}</div>
                </div>
              </div>

              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <ScoreBar label={tr('schedule.v3.scenario.coverage', 'Coverage')} value={s.scoreBreakdown.coverage} />
                <ScoreBar label={tr('schedule.v3.scenario.fairness', 'Fairness')} value={s.scoreBreakdown.fairness} />
                <ScoreBar label={tr('schedule.v3.scenario.fatigue', 'Fatigue')} value={s.scoreBreakdown.fatigue} />
                <ScoreBar label={tr('schedule.v3.scenario.cost', 'Cost')} value={s.scoreBreakdown.cost} />
                <ScoreBar label={tr('schedule.v3.scenario.simplicity', 'Simplicity')} value={s.scoreBreakdown.simplicity} />
              </div>

              {s.actions.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-foreground">
                  {s.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-purple-500">•</span>
                      <span>{a.label}</span>
                    </li>
                  ))}
                </ul>
              )}

              {(s.pros.length > 0 || s.cons.length > 0) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {s.pros.length > 0 && (
                    <ul className="space-y-0.5 text-[11px] text-emerald-800">
                      {s.pros.map((p, i) => (
                        <li key={i}>+ {p}</li>
                      ))}
                    </ul>
                  )}
                  {s.cons.length > 0 && (
                    <ul className="space-y-0.5 text-[11px] text-amber-800">
                      {s.cons.map((c, i) => (
                        <li key={i}>− {c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {explaining && (
                <p className="mt-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-950">
                  {s.explanation}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewId(s.id)}
                  className="rounded-md border border-purple-300 bg-surface px-3 py-1.5 text-xs font-medium text-purple-800 hover:bg-purple-50"
                >
                  {tr('schedule.v3.scenario.preview', 'Preview scenario')}
                </button>
                <button
                  type="button"
                  onClick={() => onApply(s)}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                >
                  {tr('schedule.v3.scenario.apply', 'Apply scenario')}
                </button>
                <button
                  type="button"
                  onClick={() => setExplainId(explaining ? null : s.id)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-subtle"
                >
                  {tr('schedule.v3.scenario.explain', 'Explain')}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {previewScenario && (
        <ScenarioPreviewModal
          scenario={previewScenario}
          formatDayLabel={formatDayLabel}
          onClose={() => setPreviewId(null)}
          t={t}
        />
      )}
    </div>
  );
}
