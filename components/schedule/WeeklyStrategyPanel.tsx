'use client';

import type { WorkforceWeeklyStrategy } from '@/lib/schedule/workforceStrategyAI';

type Props = {
  strategy: WorkforceWeeklyStrategy;
  t: (key: string) => string;
  onGenerate?: () => void;
  generating?: boolean;
  showGenerateButton?: boolean;
};

function TimelineStep({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
          done
            ? 'border-[#0F4C3A] bg-[#0F4C3A] text-white'
            : active
              ? 'border-[#0F4C3A] bg-[#0F4C3A]/10 text-[#0F4C3A]'
              : 'border-border bg-surface-subtle text-muted'
        }`}
      >
        {done ? '·' : '·'}
      </div>
      <span className={`max-w-[72px] text-center text-[10px] leading-tight ${active || done ? 'text-foreground' : 'text-muted'}`}>
        {label}
      </span>
    </div>
  );
}

export function WeeklyStrategyPanel({
  strategy,
  t,
  onGenerate,
  generating,
  showGenerateButton = true,
}: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  const s = strategy.strategy;

  const timeline = [
    { key: 'staff', label: tr('schedule.strategy.timeline.staff', 'Current Staff'), done: true, active: false },
    {
      key: 'off',
      label: tr('schedule.strategy.timeline.weeklyOff', 'Weekly Off'),
      done: s.needWeeklyOffMove,
      active: s.needWeeklyOffMove,
    },
    {
      key: 'bridge',
      label: tr('schedule.strategy.timeline.bridge', 'Bridge'),
      done: s.needBridge,
      active: s.needBridge && !s.needWeeklyOffMove,
    },
    {
      key: 'ot',
      label: tr('schedule.strategy.timeline.overtime', 'Overtime'),
      done: s.needOvertime,
      active: s.needOvertime && !s.needBridge,
    },
    {
      key: 'ext',
      label: tr('schedule.strategy.timeline.external', 'External Support'),
      done: s.needExternalSupport,
      active: s.needExternalSupport,
    },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-[#0F4C3A]/20 bg-gradient-to-b from-[#0F4C3A]/5 to-surface p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {tr('schedule.strategy.title', 'Weekly Strategy')}
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          {tr('schedule.strategy.subtitle', 'How this week should be managed before generating shifts.')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {tr('schedule.strategy.staffSituation', 'Staff Situation')}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {strategy.summary.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {strategy.staffSituation.onLeave.length > 0 && (
            <p className="mt-2 text-xs text-amber-800">
              {tr('schedule.strategy.onLeave', 'On leave')}:{' '}
              {strategy.staffSituation.onLeave.map((e) => e.name).join(', ')}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {tr('schedule.strategy.weeklyGoal', 'Weekly Goal')}
          </p>
          <p className="mt-2 text-sm text-foreground">
            {s.needExternalSupport
              ? tr('schedule.strategy.goalExternal', 'Close gaps with internal options first; external support if needed.')
              : s.needBridge || s.needOvertime || s.needWeeklyOffMove
                ? tr('schedule.strategy.goalAdjust', 'Cover the week using the recommended internal adjustments.')
                : tr('schedule.strategy.goalStandard', 'Cover the week with the current team — no extra measures.')}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {tr('schedule.strategy.plan', 'Strategy')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            [s.needWeeklyOffMove, tr('schedule.strategy.needWeeklyOff', 'Weekly off move')],
            [s.needBridge, tr('schedule.strategy.needBridge', 'Bridge')],
            [s.needOvertime, tr('schedule.strategy.needOvertime', 'Overtime')],
            [s.needExternalSupport, tr('schedule.strategy.needExternal', 'External support')],
          ].map(([on, label]) => (
            <span
              key={label as string}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                on ? 'bg-[#0F4C3A]/15 text-[#0F4C3A]' : 'bg-surface-subtle text-muted line-through'
              }`}
            >
              {label as string}
            </span>
          ))}
        </div>
      </div>

      {strategy.recommendations.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {tr('schedule.strategy.recommendations', 'Recommendations')}
          </p>
          <ol className="mt-2 space-y-3">
            {strategy.recommendations.map((rec) => (
              <li key={rec.rank} className="border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
                <p className="text-sm font-medium text-foreground">
                  {rec.rank}. {rec.title}
                </p>
                <p className="text-xs text-muted">
                  {tr('schedule.strategy.impact', 'Impact')}: {rec.impact}
                </p>
                <p className="mt-1 text-xs text-foreground">{rec.reason}</p>
                <p className="text-xs text-muted">{rec.estimatedImprovement}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-[#0F4C3A]/30 bg-[#0F4C3A]/5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0F4C3A]">
          {tr('schedule.strategy.plannerIntent', 'Planner Intent')}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{strategy.plannerIntent.text}</p>
      </div>

      <div className="flex items-center justify-between gap-2 overflow-x-auto py-2">
        {timeline.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2">
            <TimelineStep label={step.label} active={step.active} done={step.done} />
            {i < timeline.length - 1 && <div className="mb-4 h-px w-4 bg-border md:w-8" />}
          </div>
        ))}
        <div className="mb-4 hidden h-px w-4 bg-border md:block" />
        <TimelineStep
          label={tr('schedule.strategy.timeline.generate', 'Generate Proposal')}
          active
          done={false}
        />
      </div>

      <details className="rounded-lg border border-dashed border-border text-xs text-muted">
        <summary className="cursor-pointer px-3 py-2 font-semibold">
          {tr('schedule.strategy.technicalDetails', 'Technical details')}
        </summary>
        <div className="border-t border-border px-3 py-2 space-y-1">
          {strategy.decisions.map((d) => (
            <p key={d.step}>
              {d.step}. {d.question} — {d.answer.toUpperCase()}: {d.outcome}
            </p>
          ))}
        </div>
      </details>

      {showGenerateButton && onGenerate && (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="h-10 rounded-lg bg-[#0F4C3A] px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {generating
            ? tr('schedule.proposal.generating', 'Generating…')
            : tr('schedule.strategy.generateProposal', 'Generate Proposal')}
        </button>
      </div>
      )}
    </div>
  );
}
