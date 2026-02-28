'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatSarFromHalala } from '@/lib/utils/money';

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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
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
        setError(j.error ?? 'Failed to load');
        return;
      }
      const data = await res.json();
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [from, to, boutiqueId]);

  useEffect(() => {
    if (from && to) load();
  }, [from, to, load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Sales Summary</h1>
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
          placeholder="Boutique ID (ADMIN)"
          value={boutiqueId}
          onChange={(e) => setBoutiqueId(e.target.value)}
          className="rounded border px-2 py-1"
        />
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
        <div className="space-y-4 rounded-lg border bg-white p-4">
          <p className="text-sm text-slate-600">
            {summary.from} – {summary.to}
          </p>
          <p className="text-xs text-slate-500">Sources: LEDGER + IMPORT + MANUAL</p>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded border p-2">
              <p className="text-slate-600">Net sales</p>
              <p className="font-medium">{formatSarFromHalala(summary.netSalesTotal)}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-slate-600">Gross sales</p>
              <p>{formatSarFromHalala(summary.grossSalesTotal)}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-slate-600">Returns</p>
              <p>{formatSarFromHalala(summary.returnsTotal)}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-slate-600">Guest coverage net</p>
              <p>{formatSarFromHalala(summary.guestCoverageNetSales)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-2">Employee</th>
                  <th className="text-right py-1 pr-2">Net</th>
                  <th className="text-right py-1 pr-2">Guest coverage</th>
                  <th className="text-left py-1">Source boutique</th>
                </tr>
              </thead>
              <tbody>
                {summary.breakdownByEmployee.map((row) => (
                  <tr key={row.employeeId} className="border-b">
                    <td className="py-1 pr-2">{row.employeeName}</td>
                    <td className="text-right py-1 pr-2">{formatSarFromHalala(row.netSales)}</td>
                    <td className="text-right py-1 pr-2">{formatSarFromHalala(row.guestCoverageNetSales)}</td>
                    <td className="py-1">
                      {row.guestCoverageSources.map((s) => (
                        <span key={s.sourceBoutiqueId} className="mr-2">
                          {s.sourceBoutiqueName ?? s.sourceBoutiqueId}: {formatSarFromHalala(s.netSales)}
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
