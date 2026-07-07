'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalSupportStep } from '@/components/schedule/ExternalSupportStep';
import { WeeklyStrategyPanel } from '@/components/schedule/WeeklyStrategyPanel';
import type { WorkforceWeeklyStrategy } from '@/lib/schedule/workforceStrategyAI';
import type { ProposalApiResponse, ProposalDayRow, ProposalPerson } from '@/lib/schedule/proposalPresenter';
import type { ProposalBlockingIssue } from '@/lib/schedule/proposalQualityGate';
import {
  issuePillsForProposalRow,
  rowBelowRequiredCoverage,
} from '@/lib/schedule/proposalQualityGate';
import {
  getApplyIncompleteConfirmMessage,
  getIncompleteProposalBanner,
  getProposalReviewTitle,
  showIncompleteProposalBanner,
} from '@/lib/schedule/proposalReviewDisplay';
import type { PlanAction } from '@/lib/services/schedulePlanner';

type DraftGuest = {
  empId: string;
  date: string;
  shift: string;
  employee: { name: string };
  sourceBoutiqueId?: string;
};

type Props = {
  open: boolean;
  weekStart: string;
  draftGuests: DraftGuest[];
  onOpenAddGuest: () => void;
  onClose: () => void;
  onApplied: () => void;
  t: (key: string) => string;
};

type Step = 'support' | 'strategy' | 'generating' | 'review';

function PersonPill({ person }: { person: ProposalPerson }) {
  const bridge = person.kind === 'Bridge' || person.kind === 'Split';
  const tone = bridge
    ? 'border-orange-200 bg-orange-50 text-orange-950'
    : person.kind === 'External'
      ? 'border-violet-200 bg-violet-50 text-violet-950'
      : person.kind === 'PM'
        ? 'border-sky-200 bg-sky-50 text-sky-950'
        : 'border-emerald-200 bg-emerald-50 text-emerald-950';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {person.name}
      {bridge && (
        <span className="rounded bg-orange-200/80 px-1 text-[9px] font-bold uppercase tracking-wide text-orange-900">
          Bridge
        </span>
      )}
      {person.movedWeeklyOff && (
        <span className="rounded bg-amber-200/80 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-900">
          Off moved
        </span>
      )}
    </span>
  );
}

function DayRowCells({ people }: { people: ProposalPerson[] }) {
  if (!people.length) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {people.map((p) => (
        <PersonPill key={`${p.empId}-${p.kind}`} person={p} />
      ))}
    </div>
  );
}

function IssuePill({ label }: { label: string }) {
  const tone =
    label === 'Needs PM'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : label === 'Needs AM'
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : 'border-orange-200 bg-orange-50 text-orange-950';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {label}
    </span>
  );
}

function ProposalTable({
  rows,
  externalLabel,
  blockingIssues,
  t,
}: {
  rows: ProposalDayRow[];
  externalLabel: string;
  blockingIssues: ProposalBlockingIssue[];
  t: (key: string) => string;
}) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5">{tr('schedule.proposal.colDate', 'Date')}</th>
            <th className="px-3 py-2.5">{tr('schedule.proposal.colDay', 'Day')}</th>
            <th className="px-3 py-2.5">{tr('schedule.proposal.colMorning', 'Morning (AM)')}</th>
            <th className="px-3 py-2.5">{tr('schedule.proposal.colAfternoon', 'Afternoon (PM)')}</th>
            <th className="px-3 py-2.5">{externalLabel}</th>
            <th className="px-3 py-2.5 text-center">AM</th>
            <th className="px-3 py-2.5 text-center">PM</th>
            <th className="px-3 py-2.5">{tr('schedule.proposal.colStatus', 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasIssue = rowBelowRequiredCoverage(row, blockingIssues);
            const pills = issuePillsForProposalRow(row, blockingIssues);
            return (
              <tr
                key={row.date}
                className={`border-b border-border/60 last:border-b-0 ${hasIssue ? 'bg-rose-50/50' : ''}`}
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.date}</td>
                <td className="px-3 py-2 font-medium">{row.dayName}</td>
                <td className="px-3 py-2 align-top">
                  <DayRowCells people={row.morning} />
                </td>
                <td className="px-3 py-2 align-top">
                  <DayRowCells people={row.afternoon} />
                </td>
                <td className="px-3 py-2 align-top">
                  <DayRowCells people={row.externalCoverage} />
                </td>
                <td
                  className={`px-3 py-2 text-center font-semibold ${hasIssue && row.amCount < (blockingIssues.find((i) => i.date === row.date)?.requiredAm ?? 2) ? 'text-rose-700' : ''}`}
                >
                  {row.amCount}
                </td>
                <td
                  className={`px-3 py-2 text-center font-semibold ${hasIssue && row.pmCount < (blockingIssues.find((i) => i.date === row.date)?.requiredPm ?? 2) ? 'text-rose-700' : ''}`}
                >
                  {row.pmCount}
                </td>
                <td className="px-3 py-2 align-top">
                  {pills.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {pills.map((pill) => (
                        <IssuePill key={pill} label={pill} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProposedScheduleReview({
  open,
  weekStart,
  draftGuests,
  onOpenAddGuest,
  onClose,
  onApplied,
  t,
}: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  const [step, setStep] = useState<Step>('support');
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalApiResponse | null>(null);
  const [weeklyStrategy, setWeeklyStrategy] = useState<WorkforceWeeklyStrategy | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const [strategySeed, setStrategySeed] = useState(0);
  const [applying, setApplying] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const externalLabel = tr('schedule.externalCoverage', 'External Coverage');
  const reviewStatus = proposal?.status ?? proposal?.quality?.status ?? 'ACCEPTABLE';

  const externalCoveragePayload = useMemo(
    () =>
      draftGuests.map((g) => ({
        empId: g.empId,
        employeeName: g.employee.name,
        date: g.date.slice(0, 10),
        shift: g.shift,
        sourceBoutiqueId: g.sourceBoutiqueId,
      })),
    [draftGuests]
  );

  const fetchStrategy = useCallback(async () => {
    setStrategyLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/schedule/v3/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          externalCoverage: externalCoveragePayload.length ? externalCoveragePayload : undefined,
        }),
      });
      const data = (await res.json()) as { weeklyStrategy?: WorkforceWeeklyStrategy; error?: string };
      if (!res.ok || data.error || !data.weeklyStrategy) {
        throw new Error(data.error || `Strategy failed (${res.status})`);
      }
      setWeeklyStrategy(data.weeklyStrategy);
      setStep('strategy');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Strategy failed');
      setStep('support');
    } finally {
      setStrategyLoading(false);
    }
  }, [weekStart, externalCoveragePayload]);

  const fetchProposal = useCallback(
    async (seed: number, rejected: string[]) => {
      setStep('generating');
      setError(null);
      try {
        const res = await fetch('/api/schedule/v3/propose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStart,
            externalCoverage: externalCoveragePayload.length ? externalCoveragePayload : undefined,
            rejectedProposalIds: rejected,
            strategySeed: seed,
          }),
        });
        const data = (await res.json()) as ProposalApiResponse & {
          error?: string;
          strategySeed?: number;
          weeklyStrategy?: WorkforceWeeklyStrategy;
        };
        if (!res.ok || data.error) {
          throw new Error(data.error || `Proposal failed (${res.status})`);
        }
        if (data.status === 'REJECTED' || data.quality?.status === 'REJECTED') {
          throw new Error(tr('schedule.proposal.rejectedError', 'Could not produce a valid proposal. Try again.'));
        }
        setProposal(data);
        if (data.weeklyStrategy) setWeeklyStrategy(data.weeklyStrategy);
        if (typeof data.strategySeed === 'number') setStrategySeed(data.strategySeed + 1);
        setStep('review');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Proposal failed');
        setStep(weeklyStrategy ? 'strategy' : 'support');
      }
    },
    [weekStart, externalCoveragePayload, t, weeklyStrategy]
  );

  useEffect(() => {
    if (!open) {
      setStep('support');
      setProposal(null);
      setWeeklyStrategy(null);
      setRejectedIds([]);
      setStrategySeed(0);
      setError(null);
      setTechnicalOpen(false);
    }
  }, [open]);

  const handleContinueWithoutSupport = () => {
    void fetchStrategy();
  };

  const handleSupportYes = () => {
    onOpenAddGuest();
  };

  const handleSupportContinue = () => {
    void fetchStrategy();
  };

  const handleGenerateFromStrategy = () => {
    void fetchProposal(0, []);
  };

  const handleRegenerate = () => {
    if (proposal) {
      setRejectedIds((prev) => [...prev, proposal.proposalId]);
      void fetchProposal(strategySeed, [...rejectedIds, proposal.proposalId]);
    }
  };

  const handleApply = async () => {
    if (!proposal?.actions.length) return;
    const incomplete = reviewStatus === 'INCOMPLETE' || !proposal.quality?.acceptable;
    if (incomplete) {
      const ok = window.confirm(getApplyIncompleteConfirmMessage(t));
      if (!ok) return;
    }

    setApplying(true);
    setError(null);
    try {
      const res = await fetch('/api/schedule/week/plan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          reason: tr('schedule.proposal.applyReason', 'Approved proposed schedule'),
          actions: proposal.actions,
          force: incomplete,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data.error as string) || `Apply failed (${res.status})`);
      }
      onApplied();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {getProposalReviewTitle(reviewStatus, t)}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {reviewStatus === 'INCOMPLETE'
              ? tr(
                  'schedule.proposal.subtitleIncomplete',
                  'Best achievable option — review gaps before applying.'
                )
              : tr('schedule.proposal.subtitle', 'Review the generated week before applying to the editor.')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {step === 'support' && (
            <div className="space-y-4">
              <ExternalSupportStep
                t={t}
                draftGuestCount={draftGuests.length}
                onYes={handleSupportYes}
                onNo={handleContinueWithoutSupport}
              />
              {draftGuests.length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSupportContinue}
                    disabled={strategyLoading}
                    className="h-9 rounded-lg bg-[#0F4C3A] px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {strategyLoading
                      ? tr('schedule.strategy.analyzing', 'Analyzing week…')
                      : tr('schedule.proposal.continueToProposal', 'Continue to proposal')}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'strategy' && weeklyStrategy && (
            <WeeklyStrategyPanel
              strategy={weeklyStrategy}
              t={t}
              onGenerate={handleGenerateFromStrategy}
              generating={false}
            />
          )}

          {step === 'generating' && (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {tr('schedule.proposal.generating', 'Generating proposed schedule…')}
              </p>
              <p className="mt-1 text-xs text-muted">
                {tr('schedule.proposal.generatingHint', 'Using Schedule Engine v3 with your constraints.')}
              </p>
            </div>
          )}

          {step === 'review' && proposal && (
            <div className="space-y-4">
              {weeklyStrategy && (
                <WeeklyStrategyPanel
                  strategy={weeklyStrategy}
                  t={t}
                  showGenerateButton={false}
                />
              )}
              {showIncompleteProposalBanner(reviewStatus) && (
                <div
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                  role="alert"
                >
                  <p className="font-semibold">{getIncompleteProposalBanner(t)}</p>
                  {proposal.quality?.reason && (
                    <p className="mt-1 text-amber-900/90">{proposal.quality.reason}</p>
                  )}
                  {proposal.quality?.blockingIssues?.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {proposal.quality.blockingIssues.map((issue) => (
                        <li key={`${issue.date}-${issue.type}`}>
                          <span className="font-medium">{issue.dayName}</span>: {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    reviewStatus === 'ACCEPTABLE'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {reviewStatus === 'ACCEPTABLE'
                    ? tr('schedule.proposal.coverageComplete', 'Coverage complete')
                    : tr('schedule.proposal.statusIncomplete', 'Best achievable schedule')}
                </span>
                <span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-medium text-muted">
                  {tr('schedule.proposal.proposalNumber', 'Proposal')} #{proposal.proposalNumber}
                </span>
                {proposal.summary.bridgeCount > 0 && (
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-900">
                    {proposal.summary.bridgeCount} {tr('schedule.proposal.bridgeDays', 'bridge days')}
                  </span>
                )}
                {proposal.summary.compensationHours > 0 && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                    +{proposal.summary.compensationHours}h {tr('schedule.proposal.compensation', 'compensation')}
                  </span>
                )}
              </div>

              <ProposalTable
                rows={proposal.rows}
                externalLabel={externalLabel}
                blockingIssues={proposal.quality?.blockingIssues ?? []}
                t={t}
              />

              {proposal.insights.length > 0 && (
                <div className="rounded-xl border border-border bg-surface-subtle/50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {tr('schedule.proposal.insights', 'Summary')}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-foreground">
                    {proposal.insights.map((line, i) => (
                      <li key={i}>• {line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <details
                open={technicalOpen}
                onToggle={(e) => setTechnicalOpen((e.target as HTMLDetailsElement).open)}
                className="rounded-xl border border-dashed border-border"
              >
                <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-muted">
                  {tr('schedule.proposal.technicalDetails', 'Technical details')}
                </summary>
                <div className="border-t border-border px-4 py-3 text-xs text-muted">
                  <p>
                    {proposal.actions.length} {tr('schedule.proposal.plannedActions', 'planned actions')}
                  </p>
                  <p className="mt-1">
                    Overtime: {proposal.summary.overtimeHours}h · Weekly off moves:{' '}
                    {proposal.summary.weeklyOffMoves}
                  </p>
                  {proposal.quality?.recommendedAction && (
                    <p className="mt-1 text-foreground">{proposal.quality.recommendedAction}</p>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
          >
            {tr('schedule.proposal.cancelManual', 'Cancel & Edit Manually')}
          </button>
          {step === 'review' && proposal && (
            <>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={applying}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                {tr('schedule.proposal.regenerate', 'Regenerate Another')}
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={applying || !proposal.actions.length}
                className="h-10 rounded-lg bg-[#0F4C3A] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {applying
                  ? tr('common.loading', 'Loading…')
                  : reviewStatus === 'INCOMPLETE'
                    ? tr('schedule.proposal.approveIncomplete', 'Apply Incomplete Schedule')
                    : tr('schedule.proposal.approveApply', 'Approve & Apply to Schedule')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export type { ProposalApiResponse, PlanAction };
