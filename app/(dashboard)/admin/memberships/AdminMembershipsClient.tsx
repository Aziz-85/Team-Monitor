'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { Modal } from '@/components/admin/Modal';
import { MembershipEditor, type MembershipFormValues } from '@/components/admin/MembershipEditor';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import type { AdminFilterJson } from '@/lib/scope/adminFilter';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type User = { id: string; empId: string; employee?: { name: string } | null };
type Boutique = { id: string; code: string; name: string };
type MembershipRow = {
  id: string;
  userId: string;
  user: User;
  boutiqueId: string;
  boutique: Boutique;
  role: string;
  canAccess: boolean;
  canManageTasks?: boolean;
  canManageLeaves?: boolean;
  canManageSales?: boolean;
  canManageInventory?: boolean;
};

export function AdminMembershipsClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [list, setList] = useState<MembershipRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<MembershipRow | null>(null);
  const [adminFilter, setAdminFilter] = useState<AdminFilterJson | null>(null);

  const buildParams = useCallback(
    (q?: string) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (adminFilter && adminFilter.kind !== 'ALL') {
        params.set('filterKind', adminFilter.kind);
        if (adminFilter.boutiqueId) params.set('boutiqueId', adminFilter.boutiqueId);
        if (adminFilter.regionId) params.set('regionId', adminFilter.regionId);
        if (adminFilter.groupId) params.set('groupId', adminFilter.groupId);
      }
      return params;
    },
    [adminFilter]
  );

  const fetchList = useCallback(() => {
    fetch(`/api/admin/memberships?${buildParams(search)}`)
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, [search, buildParams]);

  const fetchUsers = useCallback(() => {
    const q = search ? `?q=${encodeURIComponent(search)}` : '';
    fetch(`/api/admin/users${q}`)
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, [search]);

  const fetchBoutiques = useCallback(() => {
    fetch('/api/admin/boutiques')
      .then((r) => r.json())
      .then((data) => setBoutiques(Array.isArray(data) ? data.map((b: Boutique) => ({ id: b.id, code: b.code, name: b.name })) : []))
      .catch(() => setBoutiques([]));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const onSearchSubmit = useCallback(() => {
    fetchList();
  }, [fetchList]);
  useEffect(() => {
    if (modal === 'add' || modal === 'edit') {
      fetchBoutiques();
      if (modal === 'add') fetchUsers();
    }
  }, [modal, fetchBoutiques, fetchUsers]);

  const handleCreate = useCallback(
    async (values: MembershipFormValues) => {
      const res = await fetch('/api/admin/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: values.userId,
          boutiqueId: values.boutiqueId,
          role: values.role,
          canAccess: values.canAccess,
          canManageTasks: values.canManageTasks,
          canManageLeaves: values.canManageLeaves,
          canManageSales: values.canManageSales,
          canManageInventory: values.canManageInventory,
        }),
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
    async (values: {
      role: string;
      canAccess: boolean;
      canManageTasks?: boolean;
      canManageLeaves?: boolean;
      canManageSales?: boolean;
      canManageInventory?: boolean;
    }) => {
      if (!editing) return;
      const res = await fetch('/api/admin/memberships', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          role: values.role,
          canAccess: values.canAccess,
          canManageTasks: values.canManageTasks,
          canManageLeaves: values.canManageLeaves,
          canManageSales: values.canManageSales,
          canManageInventory: values.canManageInventory,
        }),
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

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('nav.admin.memberships')}>
        <p className="mb-2 text-sm text-slate-600">{t('admin.adminFilterLabel')}</p>
        <AdminFilterBar filterLabel={t('admin.adminFilterLabel')} onFilterChange={setAdminFilter} t={t} />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder={t('admin.memberships.searchUser')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit()}
            className="max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
          />
          <button type="button" onClick={onSearchSubmit} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            {t('common.search')}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setModal('add'); }}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            {t('common.add')} {t('admin.memberships.membership')}
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>Emp ID</AdminTh>
            <AdminTh>{t('common.name')}</AdminTh>
            <AdminTh>Boutique</AdminTh>
            <AdminTh>{t('common.role')}</AdminTh>
            <AdminTh>{t('admin.memberships.canAccess')}</AdminTh>
            <AdminTh>{t('admin.memberships.permissions')}</AdminTh>
            <AdminTh>{t('common.edit')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {list.map((m) => (
              <tr key={m.id}>
                <AdminTd>{m.user.empId}</AdminTd>
                <AdminTd>{m.user.employee?.name ?? '—'}</AdminTd>
                <AdminTd>{m.boutique.name} ({m.boutique.code})</AdminTd>
                <AdminTd>{getRoleDisplayLabel(m.role as Role, null, t)}</AdminTd>
                <AdminTd>{m.canAccess ? t('adminEmp.active') : t('adminEmp.inactive')}</AdminTd>
                <AdminTd className="text-xs">
                  {[m.canManageTasks && 'Tasks', m.canManageLeaves && 'Leaves', m.canManageSales && 'Sales', m.canManageInventory && 'Inventory'].filter(Boolean).join(', ') || '—'}
                </AdminTd>
                <AdminTd>
                  <button
                    type="button"
                    onClick={() => { setEditing(m); setModal('edit'); }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {t('common.edit')}
                  </button>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      <Modal open={modal === 'add'} onClose={() => setModal(null)} title={t('admin.memberships.addMembership')}>
        <MembershipEditor
          users={users}
          boutiques={boutiques}
          onSubmit={handleCreate}
          onCancel={() => setModal(null)}
          submitLabel={t('common.save')}
          userLabel={t('admin.memberships.user')}
          boutiqueLabel={t('admin.boutiques.boutique')}
          roleLabel={t('common.role')}
          canAccessLabel={t('admin.memberships.canAccess')}
        />
      </Modal>
      <Modal
        open={modal === 'edit' && !!editing}
        onClose={() => { setModal(null); setEditing(null); }}
        title={t('admin.memberships.editMembership')}
      >
        {editing && (
          <EditMembershipForm
            initial={{
              role: editing.role,
              canAccess: editing.canAccess,
              canManageTasks: editing.canManageTasks,
              canManageLeaves: editing.canManageLeaves,
              canManageSales: editing.canManageSales,
              canManageInventory: editing.canManageInventory,
            }}
            onSubmit={handleUpdate}
            onCancel={() => { setModal(null); setEditing(null); }}
            t={t}
          />
        )}
      </Modal>
    </div>
  );
}

function EditMembershipForm({
  initial,
  onSubmit,
  onCancel,
  t,
}: {
  initial: {
    role: string;
    canAccess: boolean;
    canManageTasks?: boolean;
    canManageLeaves?: boolean;
    canManageSales?: boolean;
    canManageInventory?: boolean;
  };
  onSubmit: (v: {
    role: string;
    canAccess: boolean;
    canManageTasks?: boolean;
    canManageLeaves?: boolean;
    canManageSales?: boolean;
    canManageInventory?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  t: (k: string) => string;
}) {
  const [role, setRole] = useState(initial.role);
  const [canAccess, setCanAccess] = useState(initial.canAccess);
  const [canManageTasks, setCanManageTasks] = useState(initial.canManageTasks ?? false);
  const [canManageLeaves, setCanManageLeaves] = useState(initial.canManageLeaves ?? false);
  const [canManageSales, setCanManageSales] = useState(initial.canManageSales ?? false);
  const [canManageInventory, setCanManageInventory] = useState(initial.canManageInventory ?? false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ role, canAccess, canManageTasks, canManageLeaves, canManageSales, canManageInventory });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t('common.role')}</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
          {['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="edit-canAccess" checked={canAccess} onChange={(e) => setCanAccess(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        <label htmlFor="edit-canAccess" className="text-sm text-slate-700">{t('admin.memberships.canAccess')}</label>
      </div>
      {(role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
        <div className="space-y-1 border-t border-slate-200 pt-2">
          <p className="text-xs font-medium text-slate-500">Manager permissions</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageTasks} onChange={(e) => setCanManageTasks(e.target.checked)} /> Tasks</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageLeaves} onChange={(e) => setCanManageLeaves(e.target.checked)} /> Leaves</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageSales} onChange={(e) => setCanManageSales(e.target.checked)} /> Sales</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageInventory} onChange={(e) => setCanManageInventory(e.target.checked)} /> Inventory</label>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">{t('common.cancel')}</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50">{saving ? '…' : t('common.save')}</button>
      </div>
    </form>
  );
}
