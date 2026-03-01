'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatSarInt } from '@/lib/utils/money';
import { useT } from '@/lib/i18n/useT';

type TargetsResponse = {
  week: { key: string; from?: string; to?: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  month: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  quarter: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  half: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
  year: { key: string; targetSar: number; achievedSar: number; remainingSar: number; pct: number };
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
    guestCoverageSources: Array<{
      sourceBoutiqueId: string;
      sourceBoutiqueName?: string;
      netSales: number;
    }>;
  }>;
};

export function SalesSummaryClient() {
  const { t } = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    setTo(end.toISOString().slice(0, 10));
    setFrom(start.toISOString().slice(0, 10));
  }, []);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (boutiqueId) params.set('boutiqueId', boutiqueId);
      const res = await fetch(`/api/sales/summary?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? t('sales.summary.failedToLoad'));
        return;
      }
      const data = await res.json();
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [from, to, boutiqueId]);

  const loadTargets = useCallback(async () => {
    if (!from || !to) return;
    setTargetsLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (boutiqueId) params.set('boutiqueId', boutiqueId);
      const res = await fetch(`/api/sales/summary/targets?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        setTargets(null);
        return;
      }
      const data = await res.json();
      setTargets(data);
    } finally {
      setTargetsLoading(false);
    }
  }, [from, to, boutiqueId]);

  useEffect(() => {
    if (from && to) {
      load();
      loadTargets();
    }
  }, [from, to, load, loadTargets]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">{t('sales.summary.title')}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border px-2 py-1"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border px-2 py-1"
        />
        <input
          type="text"
          placeholder={t('sales.summary.boutiqueIdPlaceholder')}
          value={boutiqueId}
          onChange={(e) => setBoutiqueId(e.target.value)}
          className="rounded border px-2 py-1"
        />
        <button
          type="button"
          onClick={() => { load(); loadTargets(); }}
          disabled={loading}
          className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-50"
        >
          {loading ? t('sales.summary.loading') : t('sales.summary.apply')}
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}

      {targetsLoading && !targets && <p className="text-sm text-slate-500">{t('sales.summary.loadingTargets')}</p>}
      {targets && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t('sales.summary.boutiqueTargets')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: t('sales.summary.week'), data: targets.week, sub: targets.week.from && targets.week.to ? `${targets.week.from} – ${targets.week.to}` : undefined },
              { label: t('sales.summary.month'), data: targets.month, sub: targets.month.key },
              { label: t('sales.summary.quarter'), data: targets.quarter, sub: targets.quarter.key },
              { label: t('sales.summary.halfYear'), data: targets.half, sub: targets.half.key },
              { label: t('sales.summary.year'), data: targets.year, sub: targets.year.key },
            ].map(({ label, data, sub }) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-sm font-medium text-slate-700">{label}</p>
                {sub && <p className="text-xs text-slate-500">{sub}</p>}
                <p className="mt-1 text-xs text-slate-600">{t('sales.summary.target')}: {formatSarInt(data.targetSar)}</p>
                <p className="text-xs text-slate-600">{t('sales.summary.achieved')}: {formatSarInt(data.achievedSar)}</p>
                <p className="text-xs text-slate-600">{t('sales.summary.remaining')}: {formatSarInt(data.remainingSar)}</p>
                <p className="mt-1 text-sm font-medium">{t('sales.summary.progress')}: {data.pct}%</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-slate-400 transition-[width]"
                    style={{ width: `${Math.min(data.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary && (
        <div className="space-y-4 rounded-lg border bg-white p-4">
          <p className="text-sm text-slate-600">
            {summary.from} – {summary.to}
          </p>
          <p className="text-xs text-slate-500">{t('sales.summary.sourcesNote')}</p>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded border p-2">
              <p className="text-slate-600">{t('sales.summary.netSales')}</p>
              <p className="font-medium">{formatSarInt(summary.netSalesTotal)}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-slate-600">{t('sales.summary.grossSales')}</p>
              <p>{formatSarInt(summary.grossSalesTotal)}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-slate-600">{t('sales.summary.returns')}</p>
              <p>{formatSarInt(summary.returnsTotal)}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-slate-600">{t('sales.summary.guestCoverageNet')}</p>
              <p>{formatSarInt(summary.guestCoverageNetSales)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-1 pe-2 text-start">{t('sales.summary.employee')}</th>
                  <th className="py-1 pe-2 text-end">{t('sales.summary.net')}</th>
                  <th className="py-1 pe-2 text-end">{t('sales.summary.guestCoverage')}</th>
                  <th className="py-1 text-start">{t('sales.summary.sourceBoutique')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.breakdownByEmployee.map((row) => (
                  <tr key={row.employeeId} className="border-b">
                    <td className="py-1 pe-2">{row.employeeName}</td>
                    <td className="text-end py-1 pe-2">{formatSarInt(row.netSales)}</td>
                    <td className="text-end py-1 pe-2">{formatSarInt(row.guestCoverageNetSales)}</td>
                    <td className="py-1">
                      {row.guestCoverageSources.map((s) => (
                        <span key={s.sourceBoutiqueId} className="me-2">
                          {s.sourceBoutiqueName ?? s.sourceBoutiqueId}: {formatSarInt(s.netSales)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
