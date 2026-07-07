'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalSupportPrompt } from '@/components/schedule-next/ExternalSupportPrompt';
import { NextProposalTable } from '@/components/schedule-next/NextProposalTable';
import { EmployeeSummary } from '@/components/schedule-next/EmployeeSummary';
import type { ExternalSupportDraft, ScheduleNextProposal } from '@/lib/schedule-next/types';
import { weekDateStringsFromStart } from '@/lib/services/swapWeeklyOffForWeek';
import { useT } from '@/lib/i18n/useT';

type Props = {
  initialWeekStart: string;
};

type Step = 'week' | 'support' | 'ready' | 'review';

function saturdayWeekStart(d: Date): string {
  const copy = new Date(d);
  const day = copy.getUTCDay();
  const daysBack = (day - 6 + 7) % 7;
  copy.setUTCDate(copy.getUTCDate() - daysBack);
  return copy.toISOString().slice(0, 10);
}

export function ScheduleNextPage({ initialWeekStart }: Props) {
  const { t } = useT();
  const router = useRouter();

  const [weekStart, setWeekStart] = useState(initialWeekStart || saturdayWeekStart(new Date()));
  const [step, setStep] = useState<Step>('week');
  const [supportDrafts, setSupportDrafts] = useState<ExternalSupportDraft[]>([]);
  const [proposal, setProposal] = useState<ScheduleNextProposal | null>(null);
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyReason, setApplyReason] = useState('Schedule Next approved');

  const weekDates = useMemo(() => weekDateStringsFromStart(weekStart), [weekStart]);

  const generate = useCallback(
    async (opts?: { rejectCurrent?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const nextRejected = opts?.rejectCurrent && proposal ? [...rejectedIds, proposal.proposalId] : rejectedIds;
        if (opts?.rejectCurrent && proposal) setRejectedIds(nextRejected);

        const res = await fetch('/api/schedule/next/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStart,
            externalSupport: supportDrafts.filter((d) => d.date && d.employeeName),
            rejectedProposalIds: nextRejected,
            seed: nextRejected.length,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generate failed');
        setProposal(data);
        setStep('review');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generate failed');
      } finally {
        setLoading(false);
      }
    },
    [weekStart, supportDrafts, rejectedIds, proposal]
  );

  const apply = useCallback(async () => {
    if (!proposal) return;
    if (proposal.status === 'INCOMPLETE') {
      const ok = window.confirm(
        t('scheduleNext.applyIncompleteConfirm') ||
          'Coverage is incomplete. Apply anyway?'
      );
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/schedule/next/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.proposalId,
          weekStart: proposal.weekStart,
          reason: applyReason,
          actions: proposal.actions,
          weeklyOffMoves: proposal.weeklyOffMoves,
          force: proposal.status === 'INCOMPLETE',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      router.push('/schedule/edit');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setLoading(false);
    }
  }, [proposal, applyReason, router, t]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t('scheduleNext.title') || 'Schedule Planning'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t('scheduleNext.subtitle') ||
            'Generate one practical weekly schedule, review it, then approve or edit manually.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/schedule/edit?weekStart=${weekStart}`}
            className="font-medium text-muted hover:text-foreground"
          >
            {t('scheduleNext.manualEditLink') || 'Manual Edit →'}
          </Link>
          <Link href="/schedule/audit" className="font-medium text-muted hover:text-foreground">
            {t('scheduleNext.auditLink') || 'Audit →'}
          </Link>
          <Link href="/schedule/view" className="font-medium text-muted hover:text-foreground">
            {t('scheduleNext.viewLink') || 'Schedule View →'}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('scheduleNext.weekLabel') || 'Week starting'}</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => {
              setWeekStart(e.target.value);
              setStep('week');
              setProposal(null);
            }}
            className="h-10 rounded-lg border border-border bg-surface px-3"
          />
        </label>
        <p className="text-xs text-muted">
          {weekDates[0]} – {weekDates[6]}
        </p>
        {step === 'week' && (
          <button
            type="button"
            onClick={() => setStep('support')}
            className="h-10 rounded-lg border border-[#0F4C3A] bg-[#0F4C3A] px-4 text-sm font-semibold text-white"
          >
            {t('scheduleNext.continue') || 'Continue'}
          </button>
        )}
      </div>

      {step === 'support' && (
        <ExternalSupportPrompt
          open
          drafts={supportDrafts}
          onChange={setSupportDrafts}
          onContinue={() => setStep('ready')}
        />
      )}

      {(step === 'ready' || step === 'review') && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => generate()}
            className="h-10 rounded-lg border border-[#0F4C3A] bg-[#0F4C3A] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {t('scheduleNext.generate') || 'Generate Schedule'}
          </button>
          {proposal && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => generate({ rejectCurrent: true })}
                className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-60"
              >
                {t('scheduleNext.regenerate') || 'Regenerate'}
              </button>
              <button
                type="button"
                disabled={loading || proposal.status === 'NEEDS_SUPPORT'}
                onClick={apply}
                className="h-10 rounded-lg border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('scheduleNext.approveApply') || 'Approve & Apply'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/schedule/edit')}
                className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-semibold"
              >
                {t('scheduleNext.cancelManual') || 'Cancel and Edit Manually'}
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </p>
      )}

      {proposal && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                proposal.status === 'ACCEPTABLE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : proposal.status === 'NEEDS_SUPPORT'
                    ? 'bg-violet-100 text-violet-800'
                    : 'bg-amber-100 text-amber-900'
              }`}
            >
              {proposal.status}
            </span>
            {proposal.status === 'INCOMPLETE' && (
              <p className="text-sm text-amber-800">
                {t('scheduleNext.incompleteBanner') ||
                  'Some days do not meet coverage minimums.'}
              </p>
            )}
          </div>
          <NextProposalTable rows={proposal.rows} />
          <EmployeeSummary proposal={proposal} />
          <label className="block max-w-md text-sm">
            <span className="font-medium">{t('scheduleNext.applyReason') || 'Apply reason'}</span>
            <input
              type="text"
              value={applyReason}
              onChange={(e) => setApplyReason(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border px-3"
            />
          </label>
        </div>
      )}
    </div>
  );
}
