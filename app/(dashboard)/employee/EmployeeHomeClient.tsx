'use client';

import { useCallback, useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { ShiftCard } from '@/components/ui/ShiftCard';
import { useI18n } from '@/app/providers';
import { formatSarFromHalala } from '@/lib/utils/money';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type EmployeeHomeData = {
  date: string;
  todaySchedule: { am: boolean; pm: boolean };
  weekRoster: { am: Array<{ empId: string; name: string }>; pm: Array<{ empId: string; name: string }> };
  todayTasks: Array<{ taskName: string; reason: string }>;
};

export function EmployeeHomeClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [data, setData] = useState<EmployeeHomeData | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetsData, setTargetsData] = useState<{
    todayTarget: number;
    todaySales: number;
    todayPct: number;
    monthlyTarget: number;
    mtdSales: number;
    mtdPct: number;
    remaining: number;
  } | null>(null);

  const [salesEntryDate, setSalesEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [salesEntryAmount, setSalesEntryAmount] = useState<string>('');
  const [salesEntrySaving, setSalesEntrySaving] = useState(false);
  const [salesEntryError, setSalesEntryError] = useState<string | null>(null);
  const [lastEntries, setLastEntries] = useState<Array<{ id: string; date: string; amount: number }>>([]);

  const fetchLastEntries = useCallback(() => {
    fetch('/api/me/sales?days=7')
      .then((r) => r.json())
      .then((j: { entries?: Array<{ id: string; date: string; amount: number }> }) => {
        setLastEntries(j.entries ?? []);
      })
      .catch(() => setLastEntries([]));
  }, []);

  useEffect(() => {
    fetchLastEntries();
  }, [fetchLastEntries]);

  const saveSalesEntry = async () => {
    const amount = Number(salesEntryAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      setSalesEntryError('Enter a whole number ≥ 0');
      return;
    }
    setSalesEntryError(null);
    setSalesEntrySaving(true);
    try {
      const res = await fetch('/api/sales/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: salesEntryDate,
          salesSar: amount,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSalesEntryError(j.error ?? 'Save failed');
        return;
      }
      setSalesEntryAmount('');
      fetchLastEntries();
      fetch('/api/me/targets').then((r) => r.json()).then((d: { todaySales?: number; mtdSales?: number }) => {
        if (d && (typeof d.todaySales === 'number' || typeof d.mtdSales === 'number')) {
          setTargetsData((prev) => prev ? { ...prev, todaySales: d.todaySales ?? 0, mtdSales: d.mtdSales ?? 0 } : null);
        }
      }).catch(() => {});
    } finally {
      setSalesEntrySaving(false);
    }
  };

  useEffect(() => {
    fetch('/api/me/targets')
      .then((r) => r.json())
      .then((d: { todayTarget?: number; todaySales?: number; todayPct?: number; monthlyTarget?: number; mtdSales?: number; mtdPct?: number; remaining?: number }) => {
        if (d && typeof d.todayTarget === 'number') {
          setTargetsData({
            todayTarget: d.todayTarget ?? 0,
            todaySales: d.todaySales ?? 0,
            todayPct: d.todayPct ?? 0,
            monthlyTarget: d.monthlyTarget ?? 0,
            mtdSales: d.mtdSales ?? 0,
            mtdPct: d.mtdPct ?? 0,
            remaining: d.remaining ?? 0,
          });
        }
      })
      .catch(() => setTargetsData(null));
  }, []);

  useEffect(() => {
    fetch(`/api/employee/home?date=${date}`)
      .then((r) => r.json().catch(() => null))
      .then(setData)
      .catch(() => setData(null));
  }, [date]);

  if (!data) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <label className="mr-2 text-base font-medium text-slate-700">{t('common.date')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          />
        </div>

        {targetsData != null && (targetsData.monthlyTarget > 0 || targetsData.todaySales > 0 || targetsData.mtdSales > 0) && (
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <OpsCard title={t('home.dailyTargetCard')} className="!p-3">
              <p className="text-sm text-slate-600">
                {t('home.target')}: {formatSarFromHalala(targetsData.todayTarget)} · {t('home.sales')}: {formatSarFromHalala(targetsData.todaySales)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-sky-600"
                  style={{ width: `${Math.min(100, Math.max(0, targetsData.todayPct))}%` }}
                />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-700">{targetsData.todayPct.toFixed(1)}%</p>
            </OpsCard>
            <OpsCard title={t('home.monthlyProgressCard')} className="!p-3">
              <p className="text-sm text-slate-600">
                {t('home.target')}: {formatSarFromHalala(targetsData.monthlyTarget)} · MTD: {formatSarFromHalala(targetsData.mtdSales)} · {t('home.remaining')}: {formatSarFromHalala(targetsData.remaining)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.min(100, Math.max(0, targetsData.mtdPct))}%` }}
                />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-700">{targetsData.mtdPct.toFixed(1)}%</p>
            </OpsCard>
          </div>
        )}

        <OpsCard title="My Sales" className="mb-4">
          <p className="mb-2 text-sm text-slate-600">Enter daily sales (SAR). Zero is valid.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mr-1 text-xs text-slate-500">Date</label>
              <input
                type="date"
                value={salesEntryDate}
                onChange={(e) => setSalesEntryDate(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mr-1 text-xs text-slate-500">Amount (SAR)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={salesEntryAmount}
                onChange={(e) => setSalesEntryAmount(e.target.value)}
                placeholder="0"
                className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={salesEntrySaving}
              onClick={saveSalesEntry}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {salesEntrySaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {salesEntryError && <p className="mt-2 text-sm text-red-600">{salesEntryError}</p>}
          <p className="mt-2 text-xs text-slate-500">Last 7 entries:</p>
          <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
            {lastEntries.length === 0 && <li>—</li>}
            {lastEntries.map((e) => (
              <li key={e.id}>{e.date}: {formatSarFromHalala(e.amount)}</li>
            ))}
          </ul>
        </OpsCard>

        <div className="grid gap-4 md:grid-cols-2">
          <ShiftCard variant="morning" title={t('schedule.morning')}>
            {data.todaySchedule.am ? (
              <p className="text-base">You are on shift</p>
            ) : (
              <p className="text-base text-slate-500">Off</p>
            )}
          </ShiftCard>
          <ShiftCard variant="evening" title={t('schedule.evening')}>
            {data.todaySchedule.pm ? (
              <p className="text-base">You are on shift</p>
            ) : (
              <p className="text-base text-slate-500">Off</p>
            )}
          </ShiftCard>
        </div>

        <OpsCard title={t('tasks.today')} className="mt-6">
          <ul className="list-disc space-y-1 pl-4">
            {data.todayTasks.map((t) => (
              <li key={t.taskName}>
                {t.taskName} <span className="text-slate-500">({t.reason})</span>
              </li>
            ))}
            {data.todayTasks.length === 0 && <li className="text-slate-500">—</li>}
          </ul>
        </OpsCard>

        <OpsCard title={t('schedule.week')} className="mt-6">
          <p className="mb-2 text-base text-slate-600">{t('schedule.morning')}</p>
          <p className="mb-2 text-base">
            {data.weekRoster.am.map((e) => e.name).join(', ') || '—'}
          </p>
          <p className="mb-2 text-base text-slate-600">{t('schedule.evening')}</p>
          <p className="text-base">
            {data.weekRoster.pm.map((e) => e.name).join(', ') || '—'}
          </p>
        </OpsCard>
      </div>
    </div>
  );
}
