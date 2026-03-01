'use client';

import { useCallback, useEffect, useState } from 'react';

type BoutiqueRef = { id: string; code: string; name: string };

type EmployeeRow = {
  empId: string;
  name: string;
  email: string | null;
  phone: string | null;
  team: string;
  position: string | null;
  active: boolean;
  boutiqueId: string;
  boutique: BoutiqueRef | null;
};

export function AreaEmployeesClient() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [boutiques, setBoutiques] = useState<BoutiqueRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [status, setStatus] = useState<'active' | 'all'>('active');
  const [transferModal, setTransferModal] = useState<EmployeeRow | null>(null);
  const [transferToId, setTransferToId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const loadBoutiques = useCallback(() => {
    fetch('/api/area/boutiques')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setBoutiques(Array.isArray(data) ? data : []))
      .catch(() => setBoutiques([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('status', status);
    if (boutiqueId) params.set('boutiqueId', boutiqueId);
    fetch(`/api/area/employees?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then(setEmployees)
      .catch(() => setError('Failed to load employees'))
      .finally(() => setLoading(false));
  }, [q, status, boutiqueId]);

  useEffect(() => {
    loadBoutiques();
  }, [loadBoutiques]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTransfer = async () => {
    if (!transferModal || !transferToId.trim()) return;
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const res = await fetch('/api/area/employees/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: transferModal.empId,
          toBoutiqueId: transferToId.trim(),
          reason: transferReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTransferError(data.error || 'Transfer failed');
        return;
      }
      setTransferModal(null);
      setTransferToId('');
      setTransferReason('');
      load();
    } finally {
      setTransferSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-semibold text-gray-800">Employees (Global)</h1>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-3">
        <input
          type="search"
          placeholder="Search by name or ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        <select
          value={boutiqueId}
          onChange={(e) => setBoutiqueId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">All boutiques</option>
          {boutiques.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={status === 'active'}
            onChange={() => setStatus('active')}
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={status === 'all'}
            onChange={() => setStatus('all')}
          />
          All
        </label>
      </div>

      {error && (
        <p className="text-red-600">{error}</p>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E8DFC8] bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-start font-medium text-gray-700">ID</th>
                <th className="px-3 py-2 text-start font-medium text-gray-700">Name</th>
                <th className="px-3 py-2 text-start font-medium text-gray-700">Boutique</th>
                <th className="px-3 py-2 text-start font-medium text-gray-700">Team</th>
                <th className="px-3 py-2 text-start font-medium text-gray-700">Position</th>
                <th className="px-3 py-2 text-start font-medium text-gray-700">Status</th>
                <th className="px-3 py-2 text-end font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.empId} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-mono text-gray-800">{e.empId}</td>
                  <td className="px-3 py-2 text-gray-800">{e.name}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {e.boutique ? `${e.boutique.name} (${e.boutique.code})` : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{e.team}</td>
                  <td className="px-3 py-2 text-gray-600">{e.position ?? '—'}</td>
                  <td className="px-3 py-2">{e.active ? 'Active' : 'Inactive'}</td>
                  <td className="px-3 py-2 text-end">
                    {e.active && (
                      <button
                        type="button"
                        onClick={() => {
                          setTransferModal(e);
                          setTransferToId('');
                          setTransferReason('');
                          setTransferError(null);
                        }}
                        className="text-sky-600 hover:underline"
                      >
                        Transfer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">Transfer employee</h2>
            <p className="mb-2 text-sm text-gray-600">
              {transferModal.name} ({transferModal.empId}) → select target boutique
            </p>
            <select
              value={transferToId}
              onChange={(e) => setTransferToId(e.target.value)}
              className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select boutique</option>
              {boutiques
                .filter((b) => b.id !== transferModal.boutiqueId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
            </select>
            <label className="mb-2 block text-sm text-gray-600">
              Reason (optional)
            </label>
            <input
              type="text"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Reassignment"
            />
            {transferError && (
              <p className="mb-2 text-sm text-red-600">{transferError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTransferModal(null);
                  setTransferError(null);
                }}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTransfer}
                disabled={!transferToId.trim() || transferSubmitting}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {transferSubmitting ? 'Transferring…' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
