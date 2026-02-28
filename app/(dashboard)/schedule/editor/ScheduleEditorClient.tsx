'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { useI18n } from '@/app/providers';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Roster = {
  amEmployees: Array<{ empId: string; name: string }>;
  pmEmployees: Array<{ empId: string; name: string }>;
};

type CoverageSuggestion = {
  date: string;
  empId: string;
  employeeName: string;
  reason: string;
  impact: { amBefore: number; pmBefore: number; amAfter: number; pmAfter: number };
};

export function ScheduleEditorClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState<Roster | null>(null);
  const [coverageSuggestion, setCoverageSuggestion] = useState<CoverageSuggestion | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const d = new Date(date + 'T12:00:00Z');
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d);
    mon.setUTCDate(diff);
    const weekStart = mon.toISOString().slice(0, 10);
    fetch(`/api/schedule/week?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((data: { days?: Array<{ date: string; roster?: unknown }> }) => {
        const dayData = data.days?.find((d) => d.date === date);
        setRoster((dayData?.roster as Roster | undefined) ?? null);
      })
      .catch(() => setRoster(null));
  }, [date]);

  useEffect(() => {
    fetch(`/api/suggestions/coverage?date=${date}`)
      .then((r) => r.json().catch(() => null))
      .then((data: { suggestion?: CoverageSuggestion | null }) => setCoverageSuggestion(data?.suggestion ?? null))
      .catch(() => setCoverageSuggestion(null));
  }, [date]);

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/schedule" className="mb-4 inline-block text-base text-sky-600 hover:underline">
          ← {t('common.back')}
        </Link>
        <div className="mb-4">
          <label className="mr-2 text-base font-medium">{t('schedule.selectDate')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          />
        </div>

        {coverageSuggestion && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <span className="text-base font-medium text-amber-900">
              {(t('coverage.moveSuggestion') as string).replace('{name}', coverageSuggestion.employeeName)}
            </span>
            <span className="text-sm text-amber-800">{coverageSuggestion.reason}</span>
            <button
              type="button"
              onClick={async () => {
                setApplying(true);
                try {
                  const res = await fetch('/api/suggestions/coverage/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: coverageSuggestion.date, empId: coverageSuggestion.empId }),
                  });
                  if (res.ok) {
                    setCoverageSuggestion(null);
                    const d = new Date(date + 'T12:00:00Z');
                    const day = d.getUTCDay();
                    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
                    const mon = new Date(d);
                    mon.setUTCDate(diff);
                    const weekStart = mon.toISOString().slice(0, 10);
                    const weekRes = await fetch(`/api/schedule/week?weekStart=${weekStart}`, { cache: 'no-store' });
                    const data = await weekRes.json().catch(() => ({}));
                    const dayData = data.days?.find((dd: { date: string }) => dd.date === date);
                    setRoster((dayData?.roster as Roster | undefined) ?? null);
                  }
                } finally {
                  setApplying(false);
                }
              }}
              disabled={applying}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {applying ? t('coverage.applying') : t('coverage.applySuggestion')}
            </button>
          </div>
        )}

        {roster && (
          <>
            <OpsCard title={t('schedule.morning')} className="mb-4">
              <ul className="list-disc space-y-1 pl-4">
                {roster.amEmployees.map((e) => (
                  <li key={e.empId}>{e.name}</li>
                ))}
              </ul>
            </OpsCard>
            <OpsCard title={t('schedule.evening')} className="mb-4">
              <ul className="list-disc space-y-1 pl-4">
                {roster.pmEmployees.map((e) => (
                  <li key={e.empId}>{e.name}</li>
                ))}
              </ul>
            </OpsCard>
            <OpsCard title={t('schedule.overrides')}>
              <p className="mb-2 text-base text-slate-600">
                {t('schedule.coverRashidBoutique')} — {t('schedule.move')} / {t('schedule.swap')} via day override.
              </p>
              <p className="text-sm text-slate-500">
                Use API POST /api/overrides with empId, date, overrideShift (MORNING|EVENING|NONE), reason.
              </p>
            </OpsCard>
          </>
        )}
      </div>
    </div>
  );
}
