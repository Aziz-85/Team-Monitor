'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { Modal } from '@/components/admin/Modal';
import { BoutiqueForm, type BoutiqueFormValues } from '@/components/admin/BoutiqueForm';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Region = { id: string; code: string; name: string };
type BoutiqueRow = {
  id: string;
  code: string;
  name: string;
  regionId: string | null;
  region: Region | null;
  isActive: boolean;
  membersCount: number;
};

export function AdminBoutiquesClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [list, setList] = useState<BoutiqueRow[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [filterRegion, setFilterRegion] = useState<string>('');
  const [filterActive, setFilterActive] = useState<string>('');
  const [modal, setModal] = useState<'add' | 'edit' | 'wizard' | null>(null);
  const [editing, setEditing] = useState<BoutiqueRow | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardForm, setWizardForm] = useState({
    name: '',
    code: '',
    regionId: '' as string | null,
    isActive: true,
    managerUserId: '' as string | null,
    canManageSales: true,
    canManageTasks: true,
    canManageLeaves: true,
    createCurrentMonthTarget: false,
    monthTargetAmount: 0,
  });
  const [users, setUsers] = useState<{ id: string; empId: string; employee?: { name: string } | null }[]>([]);
  const [wizardSaving, setWizardSaving] = useState(false);

  const fetchList = useCallback(() => {
    const params = new URLSearchParams();
    if (filterRegion) params.set('regionId', filterRegion);
    if (filterActive === 'true') params.set('active', 'true');
    if (filterActive === 'false') params.set('active', 'false');
    fetch(`/api/admin/boutiques?${params}`)
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, [filterRegion, filterActive]);

  const fetchRegions = useCallback(() => {
    fetch('/api/admin/regions')
      .then((r) => r.json())
      .then((data) => setRegions(Array.isArray(data) ? data.map((r: { id: string; code: string; name: string }) => ({ id: r.id, code: r.code, name: r.name })) : []))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);
  useEffect(() => {
    fetchRegions();
  }, [fetchRegions]);
  useEffect(() => {
    if (modal === 'wizard') {
      fetch('/api/admin/users')
        .then((r) => r.json())
        .then((data) => setUsers(Array.isArray(data) ? data : []))
        .catch(() => setUsers([]));
    }
  }, [modal]);

  const handleBootstrap = useCallback(async () => {
    setWizardSaving(true);
    try {
      const res = await fetch('/api/admin/boutiques/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wizardForm.name,
          code: wizardForm.code,
          regionId: wizardForm.regionId || null,
          isActive: wizardForm.isActive,
          managerUserId: wizardForm.managerUserId || null,
          canManageSales: wizardForm.canManageSales,
          canManageTasks: wizardForm.canManageTasks,
          canManageLeaves: wizardForm.canManageLeaves,
          createCurrentMonthTarget: wizardForm.createCurrentMonthTarget,
          monthTargetAmount: wizardForm.monthTargetAmount,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setModal(null);
      setWizardStep(1);
      setWizardForm({ name: '', code: '', regionId: null, isActive: true, managerUserId: null, canManageSales: true, canManageTasks: true, canManageLeaves: true, createCurrentMonthTarget: false, monthTargetAmount: 0 });
      fetchList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setWizardSaving(false);
    }
  }, [wizardForm, fetchList]);

  const handleCreate = useCallback(
    async (values: BoutiqueFormValues) => {
      const res = await fetch('/api/admin/boutiques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.name, code: values.code, regionId: values.regionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setModal(null);
      fetchList();
    },
    [fetchList]
  );

  const handleUpdate = useCallback(
    async (values: BoutiqueFormValues) => {
      if (!editing) return;
      const res = await fetch(`/api/admin/boutiques/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.name, regionId: values.regionId, isActive: values.isActive }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setModal(null);
      setEditing(null);
      fetchList();
    },
    [editing, fetchList]
  );

  const handleDisable = useCallback(
    async (row: BoutiqueRow) => {
      if (!window.confirm(t('admin.boutiques.confirmDisable'))) return;
      const res = await fetch(`/api/admin/boutiques/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? 'Failed');
        return;
      }
      fetchList();
    },
    [t, fetchList]
  );

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('nav.admin.boutiques')}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="">{t('admin.boutiques.allRegions')}</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="">{t('common.all')}</option>
            <option value="true">{t('adminEmp.active')}</option>
            <option value="false">{t('adminEmp.inactive')}</option>
          </select>
          <button
            type="button"
            onClick={() => { setEditing(null); setModal('add'); }}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            {t('common.add')}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setWizardStep(1); setWizardForm({ name: '', code: '', regionId: null, isActive: true, managerUserId: null, canManageSales: true, canManageTasks: true, canManageLeaves: true, createCurrentMonthTarget: false, monthTargetAmount: 0 }); setModal('wizard'); }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('admin.boutiques.createWithWizard')}
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>{t('common.name')}</AdminTh>
            <AdminTh>Code</AdminTh>
            <AdminTh>{t('admin.boutiques.region')}</AdminTh>
            <AdminTh>{t('adminEmp.active')}</AdminTh>
            <AdminTh>{t('admin.boutiques.membersCount')}</AdminTh>
            <AdminTh>{t('common.edit')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {list.map((b) => (
              <tr key={b.id}>
                <AdminTd>
                  <Link href={`/admin/boutiques/${b.id}`} className="text-sky-600 hover:underline truncate block">
                    {b.name}
                  </Link>
                </AdminTd>
                <AdminTd>{b.code}</AdminTd>
                <AdminTd>{b.region ? `${b.region.name}` : '—'}</AdminTd>
                <AdminTd>{b.isActive ? t('adminEmp.active') : t('adminEmp.inactive')}</AdminTd>
                <AdminTd>{b.membersCount}</AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => { setEditing(b); setModal('edit'); }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {t('common.edit')}
                    </button>
                    {b.isActive && (
                      <button
                        type="button"
                        onClick={() => handleDisable(b)}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                      >
                        {t('admin.boutiques.disable')}
                      </button>
                    )}
                    <Link
                      href={`/admin/boutiques/${b.id}`}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {t('admin.boutiques.details')}
                    </Link>
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      <Modal
        open={modal === 'add'}
        onClose={() => setModal(null)}
        title={t('admin.boutiques.addBoutique')}
      >
        <BoutiqueForm
          regions={regions}
          onSubmit={handleCreate}
          onCancel={() => setModal(null)}
          submitLabel={t('common.save')}
          titleLabel={t('common.name')}
        />
      </Modal>
      <Modal
        open={modal === 'edit' && !!editing}
        onClose={() => { setModal(null); setEditing(null); }}
        title={t('admin.boutiques.editBoutique')}
      >
        {editing && (
          <BoutiqueForm
            initial={{ name: editing.name, code: editing.code, regionId: editing.regionId, isActive: editing.isActive }}
            regions={regions}
            onSubmit={handleUpdate}
            onCancel={() => { setModal(null); setEditing(null); }}
            submitLabel={t('common.save')}
            titleLabel={t('common.name')}
          />
        )}
      </Modal>

      <Modal
        open={modal === 'wizard'}
        onClose={() => { setModal(null); setWizardStep(1); }}
        title={t('admin.boutiques.bootstrapWizard')}
      >
        <div className="space-y-3">
          {wizardStep === 1 && (
            <>
              <p className="text-sm text-slate-600">1. {t('admin.boutiques.wizardStep1')}</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('common.name')}</label>
                <input type="text" value={wizardForm.name} onChange={(e) => setWizardForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-0" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
                <input type="text" value={wizardForm.code} onChange={(e) => setWizardForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase min-w-0" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('admin.boutiques.region')}</label>
                <select value={wizardForm.regionId ?? ''} onChange={(e) => setWizardForm((f) => ({ ...f, regionId: e.target.value || null }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-0">
                  <option value="">—</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wizardForm.isActive} onChange={(e) => setWizardForm((f) => ({ ...f, isActive: e.target.checked }))} />
                <span className="text-sm">{t('adminEmp.active')}</span>
              </label>
              <div className="flex justify-end"><button type="button" onClick={() => setWizardStep(2)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white">Next</button></div>
            </>
          )}
          {wizardStep === 2 && (
            <>
              <p className="text-sm text-slate-600">2. {t('admin.boutiques.wizardStep2')}</p>
              <select value={wizardForm.managerUserId ?? ''} onChange={(e) => setWizardForm((f) => ({ ...f, managerUserId: e.target.value || null }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-0">
                <option value="">— {t('admin.boutiques.noManager')} —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.empId} {u.employee?.name ? `— ${u.employee.name}` : ''}</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setWizardStep(1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Back</button>
                <button type="button" onClick={() => setWizardStep(3)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white">Next</button>
              </div>
            </>
          )}
          {wizardStep === 3 && (
            <>
              <p className="text-sm text-slate-600">3. {t('admin.boutiques.wizardStep3')}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wizardForm.canManageSales} onChange={(e) => setWizardForm((f) => ({ ...f, canManageSales: e.target.checked }))} />
                <span className="text-sm truncate">{t('admin.boutiques.canManageSales')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wizardForm.canManageTasks} onChange={(e) => setWizardForm((f) => ({ ...f, canManageTasks: e.target.checked }))} />
                <span className="text-sm truncate">{t('admin.boutiques.canManageTasks')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wizardForm.canManageLeaves} onChange={(e) => setWizardForm((f) => ({ ...f, canManageLeaves: e.target.checked }))} />
                <span className="text-sm truncate">{t('admin.boutiques.canManageLeaves')}</span>
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setWizardStep(2)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Back</button>
                <button type="button" onClick={() => setWizardStep(4)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white">Next</button>
              </div>
            </>
          )}
          {wizardStep === 4 && (
            <>
              <p className="text-sm text-slate-600">4. {t('admin.boutiques.wizardStep4')}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wizardForm.createCurrentMonthTarget} onChange={(e) => setWizardForm((f) => ({ ...f, createCurrentMonthTarget: e.target.checked }))} />
                <span className="text-sm truncate">{t('admin.boutiques.createCurrentMonthTarget')}</span>
              </label>
              {wizardForm.createCurrentMonthTarget && (
                <input type="number" min={0} value={wizardForm.monthTargetAmount} onChange={(e) => setWizardForm((f) => ({ ...f, monthTargetAmount: parseInt(e.target.value, 10) || 0 }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-0" placeholder="SAR" />
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setWizardStep(3)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Back</button>
                <button type="button" onClick={() => setWizardStep(5)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white">Next</button>
              </div>
            </>
          )}
          {wizardStep === 5 && (
            <>
              <p className="text-sm text-slate-600">5. {t('admin.boutiques.wizardStep5')}</p>
              <ul className="list-inside list-disc text-sm space-y-1 min-w-0 truncate">
                <li className="truncate">Boutique: {wizardForm.name} ({wizardForm.code})</li>
                <li>{t('adminEmp.active')}: {wizardForm.isActive ? t('adminEmp.active') : t('adminEmp.inactive')}</li>
                <li className="truncate">Manager: {wizardForm.managerUserId ? users.find((u) => u.id === wizardForm.managerUserId)?.empId ?? '—' : '—'}</li>
                <li>Flags: Sales={wizardForm.canManageSales ? 'Y' : 'N'} Tasks={wizardForm.canManageTasks ? 'Y' : 'N'} Leaves={wizardForm.canManageLeaves ? 'Y' : 'N'}</li>
                <li>{t('admin.boutiques.createCurrentMonthTarget')}: {wizardForm.createCurrentMonthTarget ? wizardForm.monthTargetAmount : 'No'}</li>
              </ul>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setWizardStep(4)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Back</button>
                <button type="button" onClick={handleBootstrap} disabled={wizardSaving || !wizardForm.name || !wizardForm.code} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50">{wizardSaving ? '…' : t('common.save')}</button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
