'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatSarFromHalala } from '@/lib/utils/money';

type ReturnItem = {
  id: string;
  txnDate: string;
  boutiqueId: string;
  employeeId: string;
  employeeName: string;
  type: string;
  referenceNo: string | null;
  lineNo: string | null;
  netAmount: number;
  originalTxnId: string | null;
};

type EmployeeOption = { empId: string; name: string };

export function SalesReturnsClient() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formType, setFormType] = useState<'RETURN' | 'EXCHANGE'>('RETURN');
  const [formDate, setFormDate] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formReferenceNo, setFormReferenceNo] = useState('');
  const [formOriginalTxnId, setFormOriginalTxnId] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    setTo(end.toISOString().slice(0, 10));
    setFrom(start.toISOString().slice(0, 10));
    setFormDate(end.toISOString().slice(0, 10));
  }, []);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/metrics/returns?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to load');
        return;
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setCanAdd(!!data.canAdd);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (from && to) load();
  }, [from, to, load]);

  useEffect(() => {
    if (!canAdd) return;
    fetch('/api/leaves/employees', { cache: 'no-store' })
      .then((r) => r.json())
      .then((list: EmployeeOption[]) => setEmployees(Array.isArray(list) ? list : []))
      .catch(() => setEmployees([]));
  }, [canAdd]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formAmount);
    if (!formDate || !formEmployeeId || !Number.isFinite(amount) || amount <= 0) {
      setSubmitError('Please fill date, employee, and a positive amount.');
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/sales/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          txnDate: formDate,
          employeeId: formEmployeeId,
          amountSar: amount,
          referenceNo: formReferenceNo.trim() || undefined,
          originalTxnId: formOriginalTxnId.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(j.error ?? 'Failed to add');
        return;
      }
      setFormAmount('');
      setFormReferenceNo('');
      setFormOriginalTxnId('');
      load();
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Returns / Exchanges</h1>

      {canAdd && (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Add return or exchange</h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Type</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'RETURN' | 'EXCHANGE')}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="RETURN">Return</option>
                <option value="EXCHANGE">Exchange</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Date</span>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Employee</span>
              <select
                value={formEmployeeId}
                onChange={(e) => setFormEmployeeId(e.target.value)}
                className="min-w-[140px] rounded border border-slate-300 px-2 py-1.5 text-sm"
                required
              >
                <option value="">Select…</option>
                {employees.map((emp) => (
                  <option key={emp.empId} value={emp.empId}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Amount (SAR)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Reference (optional)</span>
              <input
                type="text"
                value={formReferenceNo}
                onChange={(e) => setFormReferenceNo(e.target.value)}
                className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Original txn ID (optional)</span>
              <input
                type="text"
                value={formOriginalTxnId}
                onChange={(e) => setFormOriginalTxnId(e.target.value)}
                className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={submitLoading}
              className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitLoading ? 'Adding…' : 'Add'}
            </button>
          </form>
          {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}
        </section>
      )}

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
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Employee</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Reference</th>
              <th className="text-right p-2">Net (SAR)</th>
              <th className="text-left p-2">Original txn</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.txnDate}</td>
                <td className="p-2">{r.employeeName}</td>
                <td className="p-2">{r.type}</td>
                <td className="p-2">{r.referenceNo ?? '—'}</td>
                <td className="text-right p-2">{formatSarFromHalala(r.netAmount)}</td>
                <td className="p-2">{r.originalTxnId ? 'Linked' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !loading && (
          <p className="p-4 text-slate-500">No returns/exchanges in this period.</p>
        )}
      </div>
    </div>
  );
}
