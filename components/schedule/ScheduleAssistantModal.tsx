'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import type { PlanAction, SchedulePlanResult, SchedulePlanScenario } from '@/lib/services/schedulePlanner';
import { CoverageWarningSummary } from '@/components/schedule/CoverageWarningSummary';
import {
  formatCoverageWarnings,
  warningsFromSlotViolations,
} from '@/lib/schedule/coverageWarningFormatter';
import type { SlotViolation } from '@/lib/schedule/generateSchedule/types';

type ChatLine = { role: 'user' | 'assistant'; content: string };

type PlanMeta = {
  coverageValid: boolean;
  slotViolationCount: number;
  fairnessScore: number;
  splitDaysProposed: number;
  warnings: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  weekStart: string;
  onApplied: () => void;
};

function shiftLabel(from: string, to: string): string {
  const map: Record<string, string> = {
    MORNING: 'AM',
    EVENING: 'PM',
    SPLIT: 'Split',
    EXTERNAL: 'External',
    COVER_RASHID_PM: 'Rashid PM',
    OFF: 'Off',
    NONE: '—',
  };
  return `${map[from] ?? from} → ${map[to] ?? to}`;
}

export function ScheduleAssistantModal({ open, onClose, weekStart, onApplied }: Props) {
  const { t, locale } = useT();
  const [tab, setTab] = useState<'plan' | 'chat'>('plan');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SchedulePlanResult | null>(null);
  const [planMeta, setPlanMeta] = useState<PlanMeta | null>(null);
  const [scenarioId, setScenarioId] = useState<string>('dynamic');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [reason, setReason] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatLine[]>([]);
  const [applyViolations, setApplyViolations] = useState<
    Array<{ date: string; startTime: string; endTime: string; coverage: number; minCoverage: number }>
  >([]);
  const fetchSeq = useRef(0);

  const scenario: SchedulePlanScenario | null = useMemo(() => {
    if (!plan) return null;
    return plan.scenarios.find((s) => s.id === scenarioId) ?? plan.scenarios[0] ?? null;
  }, [plan, scenarioId]);

  const applyViolationsFormatted = useMemo(() => {
    if (!applyViolations.length) return formatCoverageWarnings([]);
    const asSlots: SlotViolation[] = applyViolations.map((v, i) => ({
      date: v.date,
      slotId: `apply-${i}`,
      startTime: v.startTime,
      endTime: v.endTime,
      coverage: v.coverage,
      minCoverage: v.minCoverage,
    }));
    return formatCoverageWarnings(warningsFromSlotViolations(asSlots));
  }, [applyViolations]);

  const fetchPlan = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    setPlan(null);
    setPlanMeta(null);
    setApplyViolations([]);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch('/api/schedule/week/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== fetchSeq.current) return;
      if (!res.ok) throw new Error((data.error as string) || `Failed (${res.status})`);
      if (!data.plan) throw new Error(t('schedule.assistant.loadFailed') as string);

      const loadedPlan = data.plan as SchedulePlanResult;
      const actions = loadedPlan.scenarios[0]?.actions ?? [];

      setPlan(loadedPlan);
      setPlanMeta({
        coverageValid: Boolean(data.coverageValid),
        slotViolationCount: Number(data.slotViolationCount ?? loadedPlan.scenarios[0]?.unresolved.length ?? 0),
        fairnessScore: Number(data.fairnessScore ?? 0),
        splitDaysProposed: actions.filter((a: PlanAction) => a.toShift === 'SPLIT').length,
        warnings: [],
      });
      setAiConfigured(Boolean(data.aiConfigured));
      setScenarioId(loadedPlan.recommendedScenarioId ?? 'dynamic');
    } catch (e) {
      if (seq !== fetchSeq.current) return;
      setPlan(null);
      setPlanMeta(null);
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError((t('schedule.assistant.timeout') as string) || 'Plan request timed out. Try again.');
      } else {
        setError(e instanceof Error ? e.message : (t('schedule.assistant.loadFailed') as string));
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [weekStart, t]);

  useEffect(() => {
    if (!open) return;
    setTab('plan');
    setChatHistory([]);
    setApplyViolations([]);
    setReason((t('schedule.assistant.defaultReason') as string) || 'Schedule assistant plan');
    void fetchPlan();
  }, [open, weekStart, fetchPlan, t]);

  const applyPlan = useCallback(async (force = false) => {
    if (!scenario || scenario.actions.length === 0) return;
    setApplying(true);
    setError(null);
    if (!force) setApplyViolations([]);
    try {
      const res = await fetch('/api/schedule/week/plan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          reason: reason.trim() || 'Schedule assistant plan',
          actions: scenario.actions,
          force,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'COVERAGE_INVALID' && Array.isArray(data.slotViolations)) {
          setApplyViolations(data.slotViolations);
        }
        throw new Error((data.error as string) || `Failed (${res.status})`);
      }
      setApplyViolations([]);
      onApplied();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }, [scenario, weekStart, reason, onApplied, onClose]);

  const sendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput('');
    setChatHistory((h) => [...h, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/schedule/week/plan/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          message: msg,
          scenarioId,
          locale,
          history: chatHistory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = (data.reply as string) || (t('schedule.assistant.chatError') as string);
      setChatHistory((h) => [...h, { role: 'assistant', content: reply }]);
      if (data.aiEnabled === false) setAiConfigured(false);
    } catch (e) {
      setChatHistory((h) => [
        ...h,
        { role: 'assistant', content: e instanceof Error ? e.message : 'Error' },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, weekStart, scenarioId, locale, chatHistory, t]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !applying && onClose()} />
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-lg">
        <div className="border-b border-border px-5 py-4">
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <span className="font-semibold">
              {(t('schedule.assistant.legacyLabel') as string) || 'Legacy'}
            </span>
            {' — '}
            {(t('schedule.assistant.legacyHint') as string) ||
              'Superseded by Schedule Next. For experiments only.'}
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {(t('schedule.assistant.titleV3') as string) || 'Solve Schedule'}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('schedule.assistant.subtitleV3')}</p>
          <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {t('schedule.assistant.slotValidationHint')}
          </p>
          <p className="mt-2 text-xs text-muted">{t('schedule.assistant.externalHint')}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setTab('plan')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'plan' ? 'bg-[#0F4C3A] text-white' : 'bg-surface-subtle text-foreground'
              }`}
            >
              {t('schedule.assistant.tabPlan')}
            </button>
            <button
              type="button"
              onClick={() => setTab('chat')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'chat' ? 'bg-[#0F4C3A] text-white' : 'bg-surface-subtle text-foreground'
              }`}
            >
              {t('schedule.assistant.tabChat')}
              {!aiConfigured && (
                <span className="ms-1 text-xs opacity-70">({t('schedule.assistant.aiOff')})</span>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void fetchPlan()}
                disabled={loading}
                className="shrink-0 text-xs font-medium text-red-700 underline disabled:opacity-50"
              >
                {t('common.refresh')}
              </button>
            </div>
          ) : null}

          {tab === 'plan' && (
            <>
              {loading ? (
                <p className="text-sm text-muted">{t('schedule.assistant.generating') ?? t('common.loading')}</p>
              ) : scenario ? (
                <div className="space-y-4">
                  {planMeta && (
                    <div className="rounded-lg border border-border bg-surface-subtle p-3">
                      <p className="text-xs font-semibold text-foreground">{t('schedule.assistant.planResult')}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div>
                          <div className="text-muted">{t('schedule.assistant.coverageValid')}</div>
                          <div className={planMeta.coverageValid ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                            {planMeta.coverageValid ? t('common.yes') ?? 'Yes' : t('common.no') ?? 'No'}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">{t('schedule.assistant.slotViolations')}</div>
                          <div className="font-semibold">{planMeta.slotViolationCount}</div>
                        </div>
                        <div>
                          <div className="text-muted">{t('schedule.assistant.splitProposed')}</div>
                          <div className="font-semibold">{planMeta.splitDaysProposed}</div>
                        </div>
                        <div>
                          <div className="text-muted">{t('schedule.assistant.fairnessScore')}</div>
                          <div className="font-semibold">{planMeta.fairnessScore.toFixed(1)}</div>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted">{scenario.summary}</p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-muted">{t('schedule.assistant.scenario')}</label>
                    <select
                      value={scenarioId}
                      onChange={(e) => setScenarioId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                    >
                      {plan?.scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {t(s.labelKey) as string}
                          {s.id === plan.recommendedScenarioId
                            ? ` (${t('schedule.assistant.recommended')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {scenario.actions.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-foreground">{t('schedule.assistant.proposedActions')}</p>
                      <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                        {scenario.actions.map((a: PlanAction) => (
                          <li key={a.id} className="rounded border border-border bg-surface-subtle px-3 py-2 text-xs">
                            <span className="font-medium">{a.date}</span> — {a.employeeName}:{' '}
                            {shiftLabel(a.fromShift, a.toShift)}
                            {a.toShift === 'SPLIT' && a.segments?.length ? (
                              <span className="ms-1 text-muted">
                                ({a.segments.map((s) => `${s.startTime}–${s.endTime}`).join(' / ')})
                              </span>
                            ) : null}
                            <p className="mt-1 text-muted">{a.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">{t('schedule.assistant.noActions')}</p>
                  )}

                  {scenario.unresolved.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-xs font-semibold text-amber-900">{t('schedule.assistant.unresolved')}</p>
                      <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto text-xs text-amber-900">
                        {scenario.unresolved.slice(0, 5).map((issue) => (
                          <li key={`u-${issue.date}-${issue.type}`}>• {issue.message}</li>
                        ))}
                        {scenario.unresolved.length > 5 && (
                          <li className="text-muted">+{scenario.unresolved.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {applyViolationsFormatted.summaryLine && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                      <p className="text-xs font-semibold text-red-900">{t('schedule.assistant.coverageBlocked')}</p>
                      <div className="mt-2">
                        <CoverageWarningSummary
                          formatted={applyViolationsFormatted}
                          maxCompactLines={1}
                          viewDetailsLabel={(t('schedule.warnings.showDetails') as string) || 'View details'}
                          hideDetailsLabel={(t('schedule.warnings.hideDetails') as string) || 'Hide details'}
                          className="border-red-200 bg-red-50/80"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void applyPlan(true)}
                        disabled={applying}
                        className="mt-2 rounded border border-red-400 bg-white px-3 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                      >
                        {t('schedule.assistant.applyAnyway')}
                      </button>
                    </div>
                  )}

                  {scenario.actions.length > 0 && (
                    <label className="block">
                      <span className="text-xs font-medium text-muted">{t('common.reason')}</span>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm"
                      />
                    </label>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">{t('schedule.assistant.noPlan')}</p>
              )}
            </>
          )}

          {tab === 'chat' && (
            <div className="flex h-[420px] flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-surface-subtle p-3">
                {chatHistory.length === 0 && (
                  <p className="text-sm text-muted">{t('schedule.assistant.chatPlaceholder')}</p>
                )}
                {chatHistory.map((line, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      line.role === 'user' ? 'ms-8 bg-[#0F4C3A]/10 text-foreground' : 'me-8 bg-surface text-foreground'
                    }`}
                  >
                    {line.content}
                  </div>
                ))}
                {chatLoading && <p className="text-xs text-muted">{t('common.loading')}</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !chatLoading && void sendChat()}
                  placeholder={t('schedule.assistant.chatInput') as string}
                  className="h-10 flex-1 rounded-lg border border-border px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void sendChat()}
                  disabled={chatLoading || !chatInput.trim()}
                  className="h-10 rounded-lg bg-[#0F4C3A] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t('schedule.assistant.send')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          {tab === 'plan' && scenario && scenario.actions.length > 0 && (
            <button
              type="button"
              onClick={() => void applyPlan()}
              disabled={applying || loading}
              className="h-9 rounded-lg bg-[#0F4C3A] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {applying ? t('common.loading') : t('schedule.assistant.applyPlan')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
