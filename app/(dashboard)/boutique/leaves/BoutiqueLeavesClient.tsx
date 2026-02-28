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
  escalatedAt: string | null;
  user: { empId: string; employee?: { name: string } | null };
  boutique: { id: string; code: string; name: string };
  escalatedByUser?: { empId: string } | null;
};

type Evaluation = { canManagerApprove: boolean; requiresAdmin: boolean; reasons: string[] };

const STATUS_OPTIONS = ['', 'DRAFT', 'SUBMITTED', 'APPROVED_MANAGER', 'APPROVED_ADMIN', 'REJECTED', 'CANCELLED', 'PENDING'];

export function BoutiqueLeavesClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [list, setList] = useState<LeaveRequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('SUBMITTED');
  const [role, setRole] = useState<string | null>(null);
  const [evaluationById, setEvaluationById] = useState<Record<string, Evaluation>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchList = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    fetch(`/api/leaves/requests?${params}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, [statusFilter]);

  const fetchMe = useCallback(() => {
    fetch('/api/me/scope')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data?.role && setRole(data.role))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Fetch evaluation for each SUBMITTED row when list changes (intentionally not depending on evaluationById to avoid re-running on every fetch)
  useEffect(() => {
    const submitted = list.filter((r) => r.status === 'SUBMITTED');
    submitted.forEach((r) => {
      if (evaluationById[r.id]) return;
      fetch(`/api/leaves/evaluate?id=${encodeURIComponent(r.id)}`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: Evaluation | null) => data && setEvaluationById((prev) => ({ ...prev, [r.id]: data })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when list changes
  }, [list]);

  const handleApprove = useCallback(async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch('/api/leaves/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.reasons?.length ? `${(data as { error?: string }).error}\n${(data as { reasons: string[] }).reasons.join('\n')}` : (data as { error?: string }).error ?? 'Failed';
        alert(msg);
        return;
      }
      fetchList();
      setEvaluationById((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } finally {
      setLoadingId(null);
    }
  }, [fetchList]);

  const handleEscalate = useCallback(async (id: string) => {
    const reason = window.prompt(t('leaves.rejectionReason') || 'Reason for escalation (optional):');
    setLoadingId(id);
    try {
      const res = await fetch('/api/leaves/escalate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, reason: reason ?? undefined }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? 'Failed');
        return;
      }
      fetchList();
    } finally {
      setLoadingId(null);
    }
  }, [fetchList, t]);

  const handleAdminApprove = useCallback(async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch('/api/leaves/admin-approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? 'Failed');
        return;
      }
      fetchList();
      setEvaluationById((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } finally {
      setLoadingId(null);
    }
  }, [fetchList]);

  const handleReject = useCallback(async (id: string) => {
    const reason = window.prompt(t('leaves.rejectionReason') || 'Rejection reason (optional):');
    setLoadingId(id);
    try {
      const res = await fetch('/api/leaves/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, reason: reason ?? undefined }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? 'Failed');
        return;
      }
      fetchList();
      setEvaluationById((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } finally {
      setLoadingId(null);
    }
  }, [fetchList, t]);

  const toDate = (s: string) => (typeof s === 'string' ? s.slice(0, 10) : '');

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('nav.boutiqueLeaves')}>
        <div className="mb-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900">
            {STATUS_OPTIONS.map((s) => (
              <option key={s || 'all'} value={s}>{s || 'All'}</option>
            ))}
          </select>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>Emp ID</AdminTh>
            <AdminTh>{t('common.name')}</AdminTh>
            <AdminTh>Boutique</AdminTh>
            <AdminTh>Type</AdminTh>
            <AdminTh>Start</AdminTh>
            <AdminTh>End</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Actions</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {list.map((r) => {
              const eval_ = evaluationById[r.id];
              const isSubmitted = r.status === 'SUBMITTED';
              const canManagerApprove = role !== 'ADMIN' && eval_?.canManagerApprove && !eval_?.requiresAdmin;
              const requiresAdmin = eval_?.requiresAdmin ?? false;
              const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

              return (
                <tr key={r.id}>
                  <AdminTd>{r.user?.empId ?? '—'}</AdminTd>
                  <AdminTd>{r.user?.employee?.name ?? '—'}</AdminTd>
                  <AdminTd>{r.boutique?.name ?? r.boutiqueId}</AdminTd>
                  <AdminTd>{r.type}</AdminTd>
                  <AdminTd>{toDate(r.startDate)}</AdminTd>
                  <AdminTd>{toDate(r.endDate)}</AdminTd>
                  <AdminTd>
                    {r.status}
                    {r.escalatedAt && <span className="ml-1 text-amber-600" title="Escalated">↑</span>}
                  </AdminTd>
                  <AdminTd>
                    {isSubmitted && (
                      <>
                        {isAdmin && (
                          <button type="button" onClick={() => handleAdminApprove(r.id)} disabled={!!loadingId} className="mr-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 disabled:opacity-50">Admin Approve</button>
                        )}
                        {!isAdmin && canManagerApprove && (
                          <button type="button" onClick={() => handleApprove(r.id)} disabled={!!loadingId} className="mr-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 disabled:opacity-50">Approve</button>
                        )}
                        {!isAdmin && (requiresAdmin || !eval_?.canManagerApprove) && (
                          <button type="button" onClick={() => handleEscalate(r.id)} disabled={!!loadingId} className="mr-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 disabled:opacity-50">Escalate to Admin</button>
                        )}
                        <button type="button" onClick={() => handleReject(r.id)} disabled={!!loadingId} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 disabled:opacity-50">Reject</button>
                        {requiresAdmin && eval_?.reasons?.length ? (
                          <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
                            {eval_.reasons.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>
    </div>
  );
}
