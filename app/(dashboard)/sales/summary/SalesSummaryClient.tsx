'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatSarInt } from '@/lib/utils/money';
import { useT } from '@/lib/i18n/useT';

type BoutiqueOption = { id: string; code: string; name: string };

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
  const searchParams = useSearchParams();
  const router = useRouter();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [operationalBoutique, setOperationalBoutique] = useState<{ boutiqueId: string; label: string } | null>(null);
  const [allowedBoutiques, setAllowedBoutiques] = useState<BoutiqueOption[]>([]);
  const [scopeReady, setScopeReady] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read URL on mount and when searchParams change
  useEffect(() => {
    const fromParam = searchParams.get('from')?.trim() || '';
    const toParam = searchParams.get('to')?.trim() || '';
    const boutiqueParam = searchParams.get('boutiqueId')?.trim() || '';
    if (fromParam) setFrom(fromParam);
    if (toParam) setTo(toParam);
    if (boutiqueParam) setBoutiqueId(boutiqueParam);
  }, [searchParams]);

  // Default date range when not in URL
  useEffect(() => {
    if (from || to) return;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    setTo(end.toISOString().slice(0, 10));
    setFrom(start.toISOString().slice(0, 10));
  }, [from, to]);

  // Fetch operational boutique and allowed boutiques; resolve default boutique and validate URL
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [opRes, listRes] = await Promise.all([
        fetch('/api/me/operational-boutique', { cache: 'no-store' }),
        fetch('/api/me/boutiques', { cache: 'no-store' }),
      ]);
      if (cancelled) return;
      const op = opRes.ok ? await opRes.json() : null;
      const list = listRes.ok ? await listRes.json() : null;
      const boutiques: BoutiqueOption[] = list?.boutiques ?? [];
      const defaultId = op?.boutiqueId ?? boutiques[0]?.id ?? '';
      const defaultLabel = op?.label ?? boutiques.find((b: BoutiqueOption) => b.id === defaultId)?.name ?? defaultId;
      setOperationalBoutique(defaultId ? { boutiqueId: defaultId, label: defaultLabel } : null);
      setAllowedBoutiques(boutiques);
      setScopeReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // When scope is ready, ensure boutiqueId is set to a valid allowed boutique (default or from URL)
  useEffect(() => {
    if (!scopeReady || allowedBoutiques.length === 0) return;
    const defaultId = operationalBoutique?.boutiqueId ?? allowedBoutiques[0]?.id ?? '';
    if (!defaultId) return;
    setBoutiqueId((prev) => {
      if (prev && allowedBoutiques.some((b) => b.id === prev)) return prev;
      return defaultId;
    });
  }, [scopeReady, operationalBoutique?.boutiqueId, allowedBoutiques]);

  // Sync URL when from, to, boutiqueId or scope become ready (one-way: state -> URL)
  useEffect(() => {
    if (!scopeReady) return;
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set('from', from);
    else params.delete('from');
    if (to) params.set('to', to);
    else params.delete('to');
    if (boutiqueId) params.set('boutiqueId', boutiqueId);
    else params.delete('boutiqueId');
    const qs = params.toString();
    const current = searchParams.toString();
    if (qs !== current) router.replace(qs ? `/sales/summary?${qs}` : '/sales/summary', { scroll: false });
  }, [scopeReady, from, to, boutiqueId, router, searchParams]);

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
  }, [from, to, boutiqueId, t]);

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
    if (from && to && scopeReady) {
      load();
      loadTargets();
    }
  }, [from, to, boutiqueId, scopeReady, load, loadTargets]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">{t('sales.summary.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('sales.summary.subtitle')}</p>
      </div>
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
        {scopeReady && (
          <>
            <label className="text-sm text-slate-600">{t('sales.summary.boutique')}</label>
            <select
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
              disabled={allowedBoutiques.length <= 1}
              className="rounded border px-2 py-1 min-w-[10rem]"
              aria-label={t('sales.summary.boutique')}
            >
              {allowedBoutiques.length === 0 && (
                <option value="">—</option>
              )}
              {allowedBoutiques.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </>
        )}
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
          {summary.netSalesTotal === 0 && summary.breakdownByEmployee.length === 0 && (
            <p className="text-sm text-slate-500">{t('sales.summary.noDataForPeriod')}</p>
          )}
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
