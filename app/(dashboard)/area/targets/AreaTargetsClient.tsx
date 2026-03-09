'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatSarInt } from '@/lib/utils/money';
import { addMonths, getCurrentMonthKeyRiyadh, parseMonthKey } from '@/lib/time';

type BoutiqueSummary = {
  boutiqueId: string;
  code: string;
  name: string;
  monthlyTargetAmount: number | null;
};

type EmployeeRow = {
  empId: string;
  name: string;
  boutiqueId: string;
  boutique: { id: string; code: string; name: string } | null;
};

type AuditItem = {
  id: string;
  boutiqueId: string;
  employeeId: string | null;
  month: string;
  scope: string;
  fromAmount: number;
  toAmount: number;
  reason: string | null;
  createdAt: string;
  actorEmpId: string;
};

export function AreaTargetsClient() {
  const [monthKey, setMonthKey] = useState(() => getCurrentMonthKeyRiyadh());
  const [boutiques, setBoutiques] = useState<BoutiqueSummary[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [employeeTargets, setEmployeeTargets] = useState<{ empId: string; name: string; userId: string | null; amount: number | null }[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [boutiqueFilter, setBoutiqueFilter] = useState('');
  const [editBoutiqueModal, setEditBoutiqueModal] = useState<BoutiqueSummary | null>(null);
  const [editBoutiqueAmount, setEditBoutiqueAmount] = useState('');
  const [editBoutiqueReason, setEditBoutiqueReason] = useState('');
  const [editEmployeeModal, setEditEmployeeModal] = useState<{ empId: string; name: string; boutiqueId: string; currentAmount: number | null } | null>(null);
  const [editEmployeeAmount, setEditEmployeeAmount] = useState('');
  const [editEmployeeReason, setEditEmployeeReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);

  const loadSummary = useCallback(() => {
    if (!parseMonthKey(monthKey)) return;
    setLoadingSummary(true);
    setError(null);
    const params = new URLSearchParams({ month: monthKey });
    if (boutiqueFilter) params.set('boutiqueId', boutiqueFilter);
    fetch(`/api/area/targets/summary?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((data) => setBoutiques(data.boutiques ?? []))
      .catch(() => setError('Failed to load summary'))
      .finally(() => setLoadingSummary(false));
  }, [monthKey, boutiqueFilter]);

  const loadEmployees = useCallback(() => {
    if (!boutiqueFilter) {
      setEmployees([]);
      setEmployeeTargets([]);
      return;
    }
    setLoadingEmployees(true);
    Promise.all([
      fetch(`/api/area/employees?boutiqueId=${encodeURIComponent(boutiqueFilter)}&status=active`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/area/targets/employee-targets?month=${encodeURIComponent(monthKey)}&boutiqueId=${encodeURIComponent(boutiqueFilter)}`).then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([empList, targetData]) => {
        setEmployees(empList);
        setEmployeeTargets(targetData.items ?? []);
      })
      .finally(() => setLoadingEmployees(false));
  }, [boutiqueFilter, monthKey]);

  const loadAudit = useCallback(() => {
    const params = new URLSearchParams({ month: monthKey, limit: '20' });
    if (boutiqueFilter) params.set('boutiqueId', boutiqueFilter);
    fetch(`/api/area/targets/audit?${params}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setAuditItems(data.items ?? []));
  }, [monthKey, boutiqueFilter]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (auditOpen) loadAudit();
  }, [auditOpen, loadAudit]);

  const handleSaveBoutiqueTarget = async () => {
    if (!editBoutiqueModal) return;
    const amount = parseInt(editBoutiqueAmount, 10);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Amount must be a non-negative integer');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/area/targets/boutique-monthly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boutiqueId: editBoutiqueModal.boutiqueId,
          month: monthKey,
          amount,
          reason: editBoutiqueReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      setEditBoutiqueModal(null);
      setEditBoutiqueAmount('');
      setEditBoutiqueReason('');
      loadSummary();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEmployeeTarget = async () => {
    if (!editEmployeeModal) return;
    const amount = parseInt(editEmployeeAmount, 10);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Amount must be a non-negative integer');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/area/targets/employee-monthly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boutiqueId: editEmployeeModal.boutiqueId,
          employeeId: editEmployeeModal.empId,
          month: monthKey,
          amount,
          reason: editEmployeeReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      setEditEmployeeModal(null);
      setEditEmployeeAmount('');
      setEditEmployeeReason('');
      loadSummary();
      loadEmployees();
    } finally {
      setSubmitting(false);
    }
  };

  const amountByEmpIdNullable = new Map(employeeTargets.map((e) => [e.empId, e.amount]));
  const employeesWithTargets = employees.map((e) => ({
    ...e,
    targetAmount: amountByEmpIdNullable.get(e.empId) ?? null,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-semibold text-foreground">Targets (Global)</h1>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-3">
        <label className="flex items-center gap-2 text-sm">
          Month
          <input
            type="month"
            value={monthKey}
            onChange={(e) => {
              const v = e.target.value;
              if (parseMonthKey(v)) setMonthKey(v);
            }}
            className="rounded border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => setMonthKey(addMonths(monthKey, -1))}
          className="rounded border border-border px-2 py-1.5 text-sm"
        >
          ◀ Prev
        </button>
        <button
          type="button"
          onClick={() => setMonthKey(getCurrentMonthKeyRiyadh())}
          className="rounded border border-border px-2 py-1.5 text-sm"
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => setMonthKey(addMonths(monthKey, 1))}
          className="rounded border border-border px-2 py-1.5 text-sm"
        >
          Next ▶
        </button>
        <button
          type="button"
          onClick={() => setAuditOpen(true)}
          className="ms-auto rounded border border-border px-2 py-1.5 text-sm"
        >
          View audit
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <section className="rounded-lg border border-[#E8DFC8] bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Boutique monthly targets</h2>
        {loadingSummary ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="space-y-2">
            {boutiques.map((b) => (
              <div
                key={b.boutiqueId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface-subtle px-3 py-2"
              >
                <span className="font-medium text-foreground">
                  {b.name} ({b.code})
                </span>
                <span className="tabular-nums text-muted">
                  {b.monthlyTargetAmount != null ? formatSarInt(b.monthlyTargetAmount) : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditBoutiqueModal(b);
                    setEditBoutiqueAmount(String(b.monthlyTargetAmount ?? 0));
                    setEditBoutiqueReason('');
                  }}
                  className="text-accent hover:underline"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#E8DFC8] bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Employee monthly targets</h2>
        <p className="mb-2 text-xs text-muted">
          Select a boutique to load employees and their targets for the selected month.
        </p>
        <select
          value={boutiqueFilter}
          onChange={(e) => setBoutiqueFilter(e.target.value)}
          className="mb-3 rounded border border-border px-2 py-1.5 text-sm"
        >
          <option value="">Select boutique</option>
          {boutiques.map((b) => (
            <option key={b.boutiqueId} value={b.boutiqueId}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
        {loadingEmployees ? (
          <p className="text-muted">Loading…</p>
        ) : boutiqueFilter ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-subtle">
                  <th className="px-3 py-2 text-start font-medium text-foreground">ID</th>
                  <th className="px-3 py-2 text-start font-medium text-foreground">Name</th>
                  <th className="px-3 py-2 text-end font-medium text-foreground">Target (SAR)</th>
                  <th className="px-3 py-2 text-end font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employeesWithTargets.map((e) => (
                  <tr key={e.empId} className="border-b border-border">
                    <td className="px-3 py-2 font-mono text-foreground">{e.empId}</td>
                    <td className="px-3 py-2 text-foreground">{e.name}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-muted">
                      {e.targetAmount != null ? formatSarInt(e.targetAmount) : '—'}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEditEmployeeModal({
                            empId: e.empId,
                            name: e.name,
                            boutiqueId: e.boutiqueId,
                            currentAmount: e.targetAmount ?? null,
                          });
                          setEditEmployeeAmount(String(e.targetAmount ?? 0));
                          setEditEmployeeReason('');
                        }}
                        className="text-accent hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {editBoutiqueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Edit boutique target</h2>
            <p className="mb-2 text-sm text-muted">
              {editBoutiqueModal.name} ({editBoutiqueModal.code}) — {monthKey}
            </p>
            <label className="mb-1 block text-sm text-muted">Amount (SAR, integer)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={editBoutiqueAmount}
              onChange={(e) => setEditBoutiqueAmount(e.target.value)}
              className="mb-3 w-full rounded border border-border px-2 py-1.5 text-sm"
            />
            <label className="mb-1 block text-sm text-muted">Reason (optional)</label>
            <input
              type="text"
              value={editBoutiqueReason}
              onChange={(e) => setEditBoutiqueReason(e.target.value)}
              className="mb-4 w-full rounded border border-border px-2 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditBoutiqueModal(null)}
                className="rounded border border-border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBoutiqueTarget}
                disabled={submitting}
                className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editEmployeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Edit employee target</h2>
            <p className="mb-2 text-sm text-muted">
              {editEmployeeModal.name} ({editEmployeeModal.empId}) — {monthKey}
            </p>
            <label className="mb-1 block text-sm text-muted">Amount (SAR, integer)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={editEmployeeAmount}
              onChange={(e) => setEditEmployeeAmount(e.target.value)}
              className="mb-3 w-full rounded border border-border px-2 py-1.5 text-sm"
            />
            <label className="mb-1 block text-sm text-muted">Reason (optional)</label>
            <input
              type="text"
              value={editEmployeeReason}
              onChange={(e) => setEditEmployeeReason(e.target.value)}
              className="mb-4 w-full rounded border border-border px-2 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditEmployeeModal(null)}
                className="rounded border border-border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEmployeeTarget}
                disabled={submitting}
                className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {auditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-surface p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Target change audit</h2>
            <p className="mb-2 text-sm text-muted">Month: {monthKey}</p>
            <div className="space-y-2">
              {auditItems.map((a) => (
                <div
                  key={a.id}
                  className="rounded border border-border bg-surface-subtle px-3 py-2 text-xs"
                >
                  <span className="font-medium">{a.actorEmpId}</span>
                  {' · '}
                  {a.scope}
                  {' · '}
                  {formatSarInt(a.fromAmount)} → {formatSarInt(a.toAmount)}
                  {a.reason && ` · ${a.reason}`}
                  {' · '}
                  {new Date(a.createdAt).toLocaleString()}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAuditOpen(false)}
              className="mt-4 rounded border border-border px-3 py-1.5 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
