'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatSarInt, formatSarFromHalala } from '@/lib/utils/money';

// --- Riyadh date for defaults (YYYY-MM-DD, YYYY-MM) ---
function getRiyadhToday(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function getRiyadhCurrentMonth(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return `${get('year')}-${get('month')}`;
}

// --- Types for new APIs (SAR_INT) ---
type MonthlySummaryMonth = {
  month: string;
  targetSar: number;
  achievedSar: number;
  remainingSar: number;
  pct: number;
};
type MonthlySummaryQuarter = {
  quarter: string;
  targetSar: number;
  achievedSar: number;
  remainingSar: number;
};
type MonthlySummary = {
  months: MonthlySummaryMonth[];
  quarters: MonthlySummaryQuarter[];
};
type MyDailyTarget = {
  month: string;
  monthTargetSar: number;
  achievedToDateSar: number;
  remainingSar: number;
  daysRemaining: number;
  dailyRequiredSar: number;
};
type BoutiqueDailyTarget = {
  boutiqueId: string;
  monthTargetSar: number;
  monthAchievedSar: number;
  remainingSar: number;
  daysRemaining: number;
  dailyRequiredSar: number;
  todayAchievedSar: number;
  todayPct: number;
};

// --- Legacy summary (sales-my) ---
type MonthlyRow = {
  monthKey: string;
  monthLabel: string;
  target: number;
  actual: number;
  pct: number;
  cumulativeTarget: number;
  cumulativeActual: number;
};
type Summary = {
  from: string;
  to: string;
  netSalesTotal: number;
  grossSalesTotal: number;
  returnsTotal: number;
  exchangesTotal: number;
  guestCoverageNetSales: number;
  breakdownByEmployee: Array<{
    employeeId: string;
    employeeName: string;
    netSales: number;
    guestCoverageNetSales: number;
  }>;
  monthlyBreakdown?: MonthlyRow[];
};

function getStartOfMonthAndToday(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

const BOUTIQUE_TAB_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export function SalesMyClient() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  const [dailyMonth, setDailyMonth] = useState('');
  const [dailyDate, setDailyDate] = useState('');
  const [myDaily, setMyDaily] = useState<MyDailyTarget | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'my' | 'boutique'>('my');
  const [scopeRole, setScopeRole] = useState<string | null>(null);
  const [boutiqueDaily, setBoutiqueDaily] = useState<BoutiqueDailyTarget | null>(null);
  const [boutiqueDailyLoading, setBoutiqueDailyLoading] = useState(false);
  const [boutiqueDailyError, setBoutiqueDailyError] = useState<string | null>(null);

  useEffect(() => {
    const { from: f, to: t } = getStartOfMonthAndToday();
    setFrom(f);
    setTo(t);
    const y = new Date().getFullYear();
    const curMonth = getRiyadhCurrentMonth();
    setFromMonth(`${y}-01`);
    setToMonth(curMonth);
    setDailyMonth(curMonth);
    setDailyDate(getRiyadhToday());
  }, []);

  const loadScope = useCallback(async () => {
    try {
      const res = await fetch('/api/me/scope', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setScopeRole(d.role ?? null);
      }
    } catch {
      setScopeRole(null);
    }
  }, []);
  useEffect(() => {
    loadScope();
  }, [loadScope]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/metrics/sales-my?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to load');
        return;
      }
      const data = await res.json();
      setSummary(data);
      if (!params.toString() && data.from) setFrom(data.from);
      if (!params.toString() && data.to) setTo(data.to);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const loadMonthly = useCallback(async () => {
    if (!fromMonth || !toMonth) return;
    setMonthlyLoading(true);
    setMonthlyError(null);
    try {
      const params = new URLSearchParams({ fromMonth, toMonth });
      const res = await fetch(`/api/sales/my/monthly?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMonthlyError(j.error ?? 'Failed to load monthly summary');
        setMonthlySummary(null);
        return;
      }
      const data = await res.json();
      setMonthlySummary(data);
    } finally {
      setMonthlyLoading(false);
    }
  }, [fromMonth, toMonth]);

  const loadMyDaily = useCallback(async () => {
    if (!dailyMonth || !dailyDate) return;
    setDailyLoading(true);
    setDailyError(null);
    try {
      const params = new URLSearchParams({ month: dailyMonth, date: dailyDate });
      const res = await fetch(`/api/target/my/daily?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setDailyError(j.error ?? 'Failed to load daily target');
        setMyDaily(null);
        return;
      }
      const data = await res.json();
      setMyDaily(data);
    } finally {
      setDailyLoading(false);
    }
  }, [dailyMonth, dailyDate]);

  const loadBoutiqueDaily = useCallback(async () => {
    if (!dailyMonth || !dailyDate) return;
    setBoutiqueDailyLoading(true);
    setBoutiqueDailyError(null);
    try {
      const params = new URLSearchParams({ month: dailyMonth, date: dailyDate });
      const res = await fetch(`/api/target/boutique/daily?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setBoutiqueDailyError(j.error ?? 'Failed to load boutique daily');
        setBoutiqueDaily(null);
        return;
      }
      const data = await res.json();
      setBoutiqueDaily(data);
    } finally {
      setBoutiqueDailyLoading(false);
    }
  }, [dailyMonth, dailyDate]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!from || !to) return;
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    load();
  }, [from, to, load]);

  useEffect(() => {
    if (fromMonth && toMonth) loadMonthly();
  }, [fromMonth, toMonth, loadMonthly]);

  useEffect(() => {
    if (dailyMonth && dailyDate) loadMyDaily();
  }, [dailyMonth, dailyDate, loadMyDaily]);

  useEffect(() => {
    if (activeTab === 'boutique' && dailyMonth && dailyDate && scopeRole && BOUTIQUE_TAB_ROLES.includes(scopeRole)) {
      loadBoutiqueDaily();
    }
  }, [activeTab, dailyMonth, dailyDate, scopeRole, loadBoutiqueDaily]);

  const showBoutiqueTab = scopeRole && BOUTIQUE_TAB_ROLES.includes(scopeRole);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">My Sales</h1>

      {/* Tabs: My Sales | Boutique Target */}
      {showBoutiqueTab && (
        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('my')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'my' ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-500'}`}
          >
            My Sales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('boutique')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${activeTab === 'boutique' ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-500'}`}
          >
            Boutique Target
          </button>
        </div>
      )}

      {activeTab === 'my' && (
        <>
          {/* Legacy date range + net sales summary */}
          <div className="flex flex-wrap items-center gap-2">
            <label>
              <span className="mr-1 text-sm">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded border px-2 py-1"
              />
            </label>
            <label>
              <span className="mr-1 text-sm">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded border px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Apply'}
            </button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          {summary && (
            <div className="space-y-3 rounded-lg border bg-white p-4">
              <p className="text-sm text-slate-600">
                {summary.from} – {summary.to}
              </p>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span>Net sales</span>
                  <span className="font-medium">{formatSarFromHalala(summary.netSalesTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Guest coverage net sales</span>
                  <span>{formatSarFromHalala(summary.guestCoverageNetSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Returns</span>
                  <span>{formatSarFromHalala(summary.returnsTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Exchanges</span>
                  <span>{formatSarFromHalala(summary.exchangesTotal)}</span>
                </div>
              </div>
              {summary.breakdownByEmployee.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">My totals</p>
                  <p className="text-sm">
                    {summary.breakdownByEmployee[0].employeeName}: {formatSarFromHalala(summary.breakdownByEmployee[0].netSales)} net
                    {summary.breakdownByEmployee[0].guestCoverageNetSales !== 0 && (
                      <span> ({formatSarFromHalala(summary.breakdownByEmployee[0].guestCoverageNetSales)} guest coverage)</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 1 — Monthly table (from /api/sales/my/monthly) */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Monthly target summary</h2>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-sm">
                From month
                <input
                  type="month"
                  value={fromMonth}
                  onChange={(e) => setFromMonth(e.target.value)}
                  className="ml-1 rounded border px-2 py-1"
                />
              </label>
              <label className="text-sm">
                To month
                <input
                  type="month"
                  value={toMonth}
                  onChange={(e) => setToMonth(e.target.value)}
                  className="ml-1 rounded border px-2 py-1"
                />
              </label>
              <button
                type="button"
                onClick={loadMonthly}
                disabled={monthlyLoading}
                className="rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                {monthlyLoading ? 'Loading…' : 'Apply'}
              </button>
            </div>
            {monthlyError && <p className="mb-2 text-sm text-red-600">{monthlyError}</p>}
            {monthlySummary && monthlySummary.months.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-1.5 pr-2 font-semibold text-slate-700">Month</th>
                      <th className="py-1.5 pr-2 text-right font-semibold text-slate-700">Target</th>
                      <th className="py-1.5 pr-2 text-right font-semibold text-slate-700">Achieved</th>
                      <th className="py-1.5 pr-2 text-right font-semibold text-slate-700">Remaining</th>
                      <th className="py-1.5 pr-2 text-right font-semibold text-slate-700">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.months.map((row) => (
                      <tr key={row.month} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2">{row.month}</td>
                        <td className="py-1.5 pr-2 text-right">{formatSarInt(row.targetSar)}</td>
                        <td className="py-1.5 pr-2 text-right">{formatSarInt(row.achievedSar)}</td>
                        <td className="py-1.5 pr-2 text-right">{formatSarInt(row.remainingSar)}</td>
                        <td className="py-1.5 pr-2 text-right font-medium">{row.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {monthlySummary && monthlySummary.months.length === 0 && (
              <p className="text-sm text-slate-500">No months in range.</p>
            )}
          </div>

          {/* Section 2 — Quarter cards */}
          {monthlySummary && monthlySummary.quarters.length > 0 && (
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Quarter aggregates</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {monthlySummary.quarters.map((q) => (
                  <div key={q.quarter} className="rounded border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-700">{q.quarter}</p>
                    <p className="mt-1 text-xs text-slate-600">Target: {formatSarInt(q.targetSar)}</p>
                    <p className="text-xs text-slate-600">Achieved: {formatSarInt(q.achievedSar)}</p>
                    <p className="text-xs text-slate-600">Remaining: {formatSarInt(q.remainingSar)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3 — My Dynamic Daily Target card */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">My dynamic daily target</h2>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-sm">
                Month
                <input
                  type="month"
                  value={dailyMonth}
                  onChange={(e) => setDailyMonth(e.target.value)}
                  className="ml-1 rounded border px-2 py-1"
                />
              </label>
              <label className="text-sm">
                Date
                <input
                  type="date"
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  className="ml-1 rounded border px-2 py-1"
                />
              </label>
              <button
                type="button"
                onClick={loadMyDaily}
                disabled={dailyLoading}
                className="rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                {dailyLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {dailyError && <p className="mb-2 text-sm text-red-600">{dailyError}</p>}
            {myDaily && (
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Month target</span>
                  <span className="font-medium">{formatSarInt(myDaily.monthTargetSar)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Achieved to date</span>
                  <span>{formatSarInt(myDaily.achievedToDateSar)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Remaining</span>
                  <span>{formatSarInt(myDaily.remainingSar)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Days remaining</span>
                  <span>{myDaily.daysRemaining}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-medium text-slate-700">Daily required today</span>
                  <span className="font-semibold">{formatSarInt(myDaily.dailyRequiredSar)}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'boutique' && showBoutiqueTab && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Boutique daily target</h2>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-sm">
              Month
              <input
                type="month"
                value={dailyMonth}
                onChange={(e) => setDailyMonth(e.target.value)}
                className="ml-1 rounded border px-2 py-1"
              />
            </label>
            <label className="text-sm">
              Date
              <input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="ml-1 rounded border px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={loadBoutiqueDaily}
              disabled={boutiqueDailyLoading}
              className="rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {boutiqueDailyLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {boutiqueDailyError && <p className="mb-2 text-sm text-red-600">{boutiqueDailyError}</p>}
          {boutiqueDaily && (
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Boutique</span>
                <span className="font-medium">{boutiqueDaily.boutiqueId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Month target</span>
                <span>{formatSarInt(boutiqueDaily.monthTargetSar)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Achieved</span>
                <span>{formatSarInt(boutiqueDaily.monthAchievedSar)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Remaining</span>
                <span>{formatSarInt(boutiqueDaily.remainingSar)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Days remaining</span>
                <span>{boutiqueDaily.daysRemaining}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Daily required</span>
                <span className="font-medium">{formatSarInt(boutiqueDaily.dailyRequiredSar)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-600">Today achieved</span>
                <span>{formatSarInt(boutiqueDaily.todayAchievedSar)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Today %</span>
                <span className="font-semibold">{boutiqueDaily.todayPct}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
