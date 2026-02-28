'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type BoutiqueDetail = {
  id: string;
  code: string;
  name: string;
  regionId: string | null;
  region: { id: string; code: string; name: string } | null;
  isActive: boolean;
  membersCount: number;
};

type MembershipRow = {
  id: string;
  userId: string;
  user: { empId: string; employee?: { name: string } | null };
  boutiqueId: string;
  role: string;
  canAccess: boolean;
};

export function AdminBoutiqueDetailClient({ boutiqueId }: { boutiqueId: string }) {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [boutique, setBoutique] = useState<BoutiqueDetail | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [tab, setTab] = useState<'info' | 'memberships'>('info');
  const [editForm, setEditForm] = useState<{ name: string; regionId: string | null; isActive: boolean } | null>(null);

  const fetchBoutique = useCallback(() => {
    fetch(`/api/admin/boutiques/${boutiqueId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setBoutique(null);
        else setBoutique(data);
      })
      .catch(() => setBoutique(null));
  }, [boutiqueId]);

  const fetchMemberships = useCallback(() => {
    fetch(`/api/admin/memberships?boutiqueId=${encodeURIComponent(boutiqueId)}`)
      .then((r) => r.json())
      .then((data) => setMemberships(Array.isArray(data) ? data : []))
      .catch(() => setMemberships([]));
  }, [boutiqueId]);

  useEffect(() => {
    fetchBoutique();
  }, [fetchBoutique]);
  useEffect(() => {
    if (tab === 'memberships') fetchMemberships();
  }, [tab, fetchMemberships]);

  const startEdit = useCallback(() => {
    if (boutique) setEditForm({ name: boutique.name, regionId: boutique.regionId, isActive: boutique.isActive });
  }, [boutique]);

  const saveEdit = useCallback(async () => {
    if (!editForm) return;
    const res = await fetch(`/api/admin/boutiques/${boutiqueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert((err as { error?: string }).error ?? 'Failed');
      return;
    }
    setEditForm(null);
    fetchBoutique();
  }, [boutiqueId, editForm, fetchBoutique]);

  if (!boutique) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-slate-600">{t('admin.boutiques.notFound')}</p>
        <Link href="/admin/boutiques" className="text-sky-600 hover:underline">
          {t('admin.boutiques.backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 p-4 md:p-6">
      <div className="mb-4">
        <Link href="/admin/boutiques" className="text-sm text-sky-600 hover:underline">
          ← {t('admin.boutiques.backToList')}
        </Link>
      </div>
      <OpsCard title={`${boutique.name} (${boutique.code})`}>
        <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab('info')}
            className={`px-3 py-2 text-sm ${tab === 'info' ? 'border-b-2 border-sky-500 font-medium text-sky-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t('admin.boutiques.info')}
          </button>
          <button
            type="button"
            onClick={() => setTab('memberships')}
            className={`px-3 py-2 text-sm ${tab === 'memberships' ? 'border-b-2 border-sky-500 font-medium text-sky-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t('admin.boutiques.memberships')} ({boutique.membersCount})
          </button>
        </div>

        {tab === 'info' && (
          <div className="space-y-3">
            {editForm ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('common.name')}</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })}
                    className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="detail-active"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm((f) => f && { ...f, isActive: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <label htmlFor="detail-active">{t('adminEmp.active')}</label>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={saveEdit} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700">
                    {t('common.save')}
                  </button>
                  <button type="button" onClick={() => setEditForm(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p><span className="font-medium text-slate-700">{t('common.name')}:</span> {boutique.name}</p>
                <p><span className="font-medium text-slate-700">Code:</span> {boutique.code}</p>
                <p><span className="font-medium text-slate-700">{t('admin.boutiques.region')}:</span> {boutique.region ? boutique.region.name : '—'}</p>
                <p><span className="font-medium text-slate-700">{t('adminEmp.active')}:</span> {boutique.isActive ? t('adminEmp.active') : t('adminEmp.inactive')}</p>
                <button type="button" onClick={startEdit} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {t('common.edit')}
                </button>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/admin/targets?boutiqueId=${boutiqueId}`} className="text-sm text-sky-600 hover:underline">
                {t('admin.boutiques.targets')}
              </Link>
              <Link href={`/sales/daily?boutiqueId=${boutiqueId}`} className="text-sm text-sky-600 hover:underline">
                {t('admin.boutiques.salesDailyLedger')}
              </Link>
            </div>
          </div>
        )}

        {tab === 'memberships' && (
          <>
            <p className="mb-2 text-sm text-slate-600">
              <Link href={`/admin/memberships?boutiqueId=${boutiqueId}`} className="text-sky-600 hover:underline">
                {t('admin.boutiques.manageMemberships')}
              </Link>
            </p>
            <AdminDataTable>
              <AdminTableHead>
                <AdminTh>Emp ID</AdminTh>
                <AdminTh>{t('common.name')}</AdminTh>
                <AdminTh>{t('common.role')}</AdminTh>
                <AdminTh>{t('admin.memberships.canAccess')}</AdminTh>
              </AdminTableHead>
              <AdminTableBody>
                {memberships.map((m) => (
                  <tr key={m.id}>
                    <AdminTd>{m.user.empId}</AdminTd>
                    <AdminTd>{m.user.employee?.name ?? '—'}</AdminTd>
                    <AdminTd>{getRoleDisplayLabel(m.role as Role, null, t)}</AdminTd>
                    <AdminTd>{m.canAccess ? t('adminEmp.active') : t('adminEmp.inactive')}</AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          </>
        )}
      </OpsCard>
    </div>
  );
}
