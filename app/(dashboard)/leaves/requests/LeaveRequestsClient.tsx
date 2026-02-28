'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type LeaveRequestRow = {
  id: string;
  boutiqueId: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  notes: string | null;
  createdAt: string;
  user: { empId: string; employee?: { name: string } | null };
  boutique: { id: string; code: string; name: string };
};

type Boutique = { id: string; code: string; name: string };

const LEAVE_TYPES = ['ANNUAL', 'EXHIBITION', 'SICK', 'OTHER_BRANCH', 'EMERGENCY', 'OTHER'] as const;

export function LeaveRequestsClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [list, setList] = useState<LeaveRequestRow[]>([]);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ boutiqueId: '', startDate: '', endDate: '', type: 'ANNUAL' as string, notes: '', submitNow: true });
  const [saving, setSaving] = useState(false);
  const [evaluationById, setEvaluationById] = useState<Record<string, { canManagerApprove: boolean; requiresAdmin: boolean; reasons: string[] }>>({});

  const fetchList = useCallback(() => {
    fetch('/api/leaves/requests?self=true')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, []);

  const fetchBoutiques = useCallback(() => {
    fetch('/api/me/boutiques')
      .then((r) => r.json())
      .then((data) => setBoutiques(Array.isArray(data?.boutiques) ? data.boutiques : []))
      .catch(() => setBoutiques([]));
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { if (modal) fetchBoutiques(); }, [modal, fetchBoutiques]);

  const fetchEvaluation = useCallback((id: string) => {
    fetch(`/api/leaves/evaluate?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setEvaluationById((prev) => ({ ...prev, [id]: data })))
      .catch(() => {});
  }, []);

  const handleSubmitToManager = useCallback(async (id: string) => {
    const res = await fetch('/api/leaves/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert((err as { error?: string }).error ?? 'Failed');
      return;
    }
    fetchList();
  }, [fetchList]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.boutiqueId || !form.startDate || !form.endDate) return;
    setSaving(true);
    try {
      const res = await fetch('/api/leaves/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId: form.boutiqueId, startDate: form.startDate, endDate: form.endDate, type: form.type, notes: form.notes || null, submit: form.submitNow }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? 'Failed');
        return;
      }
      setModal(false);
      setForm({ boutiqueId: '', startDate: '', endDate: '', type: 'ANNUAL', notes: '', submitNow: true });
      fetchList();
    } finally {
      setSaving(false);
    }
  }, [form, fetchList]);

  const toDate = (s: string) => s.slice(0, 10);

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('leaves.myRequests')}>
        <div className="mb-3">
          <button type="button" onClick={() => setModal(true)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700">
            {t('leaves.submitRequest')}
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>{t('admin.boutiques.boutique')}</AdminTh>
            <AdminTh>{t('leaves.type')}</AdminTh>
            <AdminTh>Start</AdminTh>
            <AdminTh>End</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Actions</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {list.map((r) => {
              const eval_ = evaluationById[r.id];
              return (
                <tr key={r.id}>
                  <AdminTd>{r.boutique?.name ?? r.boutiqueId}</AdminTd>
                  <AdminTd>{r.type}</AdminTd>
                  <AdminTd>{toDate(r.startDate)}</AdminTd>
                  <AdminTd>{toDate(r.endDate)}</AdminTd>
                  <AdminTd>{r.status}</AdminTd>
                  <AdminTd>
                    {r.status === 'DRAFT' && (
                      <>
                        <button type="button" onClick={() => handleSubmitToManager(r.id)} className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-800">Submit</button>
                      </>
                    )}
                    {r.status === 'SUBMITTED' && (
                      <button type="button" onClick={() => fetchEvaluation(r.id)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">Why escalation?</button>
                    )}
                    {eval_ && eval_.reasons.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
                        {eval_.reasons.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      {modal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setModal(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold">{t('leaves.submitRequest')}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('admin.boutiques.boutique')}</label>
                <select required value={form.boutiqueId} onChange={(e) => setForm((f) => ({ ...f, boutiqueId: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">—</option>
                  {boutiques.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('leaves.type')}</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {LEAVE_TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
                <input type="date" required value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">End date</label>
                <input type="date" required value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</label>
                <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="submitNow" checked={form.submitNow} onChange={(e) => setForm((f) => ({ ...f, submitNow: e.target.checked }))} className="rounded border-slate-300" />
                <label htmlFor="submitNow" className="text-sm text-slate-700">Submit immediately (otherwise save as draft)</label>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50">Submit</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
