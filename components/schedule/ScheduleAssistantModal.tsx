'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import type { PlanAction, SchedulePlanResult, SchedulePlanScenario } from '@/lib/services/schedulePlanner';

type ChatLine = { role: 'user' | 'assistant'; content: string };

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
  const [scenarioId, setScenarioId] = useState<string>('balanced');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [reason, setReason] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatLine[]>([]);

  const scenario: SchedulePlanScenario | null = useMemo(() => {
    if (!plan) return null;
    return plan.scenarios.find((s) => s.id === scenarioId) ?? plan.scenarios[0] ?? null;
  }, [plan, scenarioId]);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/schedule/week/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error as string) || `Failed (${res.status})`);
      setPlan(data.plan as SchedulePlanResult);
      setAiConfigured(Boolean(data.aiConfigured));
      setScenarioId((data.plan as SchedulePlanResult).recommendedScenarioId ?? 'balanced');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    if (open) {
      setTab('plan');
      setChatHistory([]);
      setReason((t('schedule.assistant.defaultReason') as string) || 'Schedule assistant plan');
      void fetchPlan();
    }
  }, [open, fetchPlan, t]);

  const applyPlan = useCallback(async () => {
    if (!scenario || scenario.actions.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch('/api/schedule/week/plan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          reason: reason.trim() || 'Schedule assistant plan',
          actions: scenario.actions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error as string) || `Failed (${res.status})`);
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
          <h3 className="text-lg font-semibold text-foreground">{t('schedule.assistant.title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('schedule.assistant.subtitle')}</p>
        <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">
          {t('schedule.assistant.policyHint')}
        </p>
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
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

          {tab === 'plan' && (
            <>
              {loading ? (
                <p className="text-sm text-muted">{t('common.loading')}</p>
              ) : scenario ? (
                <div className="space-y-4">
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
                    <p className="mt-2 text-sm text-foreground">{scenario.summary}</p>
                  </div>

                  {scenario.issuesBefore.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-xs font-semibold text-amber-900">{t('schedule.assistant.issuesBefore')}</p>
                      <ul className="mt-1 space-y-1 text-xs text-amber-900">
                        {scenario.issuesBefore.map((issue) => (
                          <li key={`${issue.date}-${issue.type}`}>• {issue.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {scenario.actions.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-foreground">{t('schedule.assistant.proposedActions')}</p>
                      <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                        {scenario.actions.map((a: PlanAction) => (
                          <li key={a.id} className="rounded border border-border bg-surface-subtle px-3 py-2 text-xs">
                            <span className="font-medium">{a.date}</span> — {a.employeeName}:{' '}
                            {shiftLabel(a.fromShift, a.toShift)}
                            <span className="ms-1 rounded bg-surface px-1 py-0.5 text-[10px] uppercase">{a.type}</span>
                            <p className="mt-1 text-muted">{a.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">{t('schedule.assistant.noActions')}</p>
                  )}

                  {scenario.unresolved.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50/80 p-3">
                      <p className="text-xs font-semibold text-red-900">{t('schedule.assistant.unresolved')}</p>
                      <ul className="mt-1 space-y-1 text-xs text-red-900">
                        {scenario.unresolved.map((issue) => (
                          <li key={`u-${issue.date}-${issue.type}`}>• {issue.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-foreground">{t('schedule.assistant.fairness')}</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="py-1">{t('schedule.assistant.employee')}</th>
                            <th className="py-1">AM</th>
                            <th className="py-1">PM</th>
                            <th className="py-1">{t('schedule.assistant.overrides')}</th>
                            <th className="py-1">{t('schedule.assistant.load')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...scenario.fairness]
                            .sort((a, b) => b.loadScore - a.loadScore)
                            .slice(0, 8)
                            .map((f) => (
                              <tr key={f.empId} className="border-t border-border">
                                <td className="py-1 font-medium">{f.name}</td>
                                <td className="py-1">{f.amDays}</td>
                                <td className="py-1">{f.pmDays}</td>
                                <td className="py-1">{f.monthlyOverrides}</td>
                                <td className="py-1">{f.loadScore.toFixed(1)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

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
