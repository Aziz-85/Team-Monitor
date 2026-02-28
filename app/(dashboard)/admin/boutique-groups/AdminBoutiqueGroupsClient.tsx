'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { Modal } from '@/components/admin/Modal';
import { GroupForm, type GroupFormValues } from '@/components/admin/GroupForm';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type GroupRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  members: { boutiqueId: string; boutique: { id: string; code: string; name: string } }[];
  membersCount: number;
};

type Boutique = { id: string; code: string; name: string };

export function AdminBoutiqueGroupsClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [list, setList] = useState<GroupRow[]>([]);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [modal, setModal] = useState<'add' | 'edit' | 'members' | null>(null);
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [membersModalGroup, setMembersModalGroup] = useState<GroupRow | null>(null);
  const [membersAddRemove, setMembersAddRemove] = useState<{ add: string[]; remove: string[] }>({ add: [], remove: [] });

  const fetchList = useCallback(() => {
    fetch('/api/admin/boutique-groups')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, []);

  const fetchBoutiques = useCallback(() => {
    fetch('/api/admin/boutiques')
      .then((r) => r.json())
      .then((data) => setBoutiques(Array.isArray(data) ? data.map((b: { id: string; code: string; name: string }) => ({ id: b.id, code: b.code, name: b.name })) : []))
      .catch(() => setBoutiques([]));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);
  useEffect(() => {
    if (modal === 'members' || modal === 'add' || modal === 'edit') fetchBoutiques();
  }, [modal, fetchBoutiques]);

  const handleCreate = useCallback(
    async (values: GroupFormValues) => {
      const res = await fetch('/api/admin/boutique-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
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
    async (values: GroupFormValues) => {
      if (!editing) return;
      const res = await fetch('/api/admin/boutique-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...values }),
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

  const saveMembers = useCallback(async () => {
    if (!membersModalGroup) return;
    const res = await fetch(`/api/admin/boutique-groups/${membersModalGroup.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(membersAddRemove),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert((err as { error?: string }).error ?? 'Failed');
      return;
    }
    setMembersModalGroup(null);
    setMembersAddRemove({ add: [], remove: [] });
    setModal(null);
    fetchList();
  }, [membersModalGroup, membersAddRemove, fetchList]);

  const currentMemberIds = membersModalGroup ? new Set(membersModalGroup.members.map((m) => m.boutiqueId)) : new Set();
  const availableToAdd = boutiques.filter((b) => !currentMemberIds.has(b.id));

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('nav.admin.boutiqueGroups')}>
        <div className="mb-3">
          <button
            type="button"
            onClick={() => { setEditing(null); setModal('add'); }}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            {t('common.add')}
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>{t('common.name')}</AdminTh>
            <AdminTh>Code</AdminTh>
            <AdminTh>{t('adminEmp.active')}</AdminTh>
            <AdminTh>{t('admin.boutiques.membersCount')}</AdminTh>
            <AdminTh>{t('common.edit')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {list.map((g) => (
              <tr key={g.id}>
                <AdminTd>{g.name}</AdminTd>
                <AdminTd>{g.code ?? '—'}</AdminTd>
                <AdminTd>{g.isActive ? t('adminEmp.active') : t('adminEmp.inactive')}</AdminTd>
                <AdminTd>{g.membersCount}</AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => { setEditing(g); setModal('edit'); }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMembersModalGroup(g); setMembersAddRemove({ add: [], remove: [] }); setModal('members'); }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {t('admin.groups.manageMembers')}
                    </button>
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      <Modal open={modal === 'add'} onClose={() => setModal(null)} title={t('admin.groups.addGroup')}>
        <GroupForm onSubmit={handleCreate} onCancel={() => setModal(null)} submitLabel={t('common.save')} nameLabel={t('common.name')} />
      </Modal>
      <Modal
        open={modal === 'edit' && !!editing}
        onClose={() => { setModal(null); setEditing(null); }}
        title={t('admin.groups.editGroup')}
      >
        {editing && (
          <GroupForm
            initial={{ name: editing.name, code: editing.code ?? undefined, isActive: editing.isActive }}
            onSubmit={handleUpdate}
            onCancel={() => { setModal(null); setEditing(null); }}
            submitLabel={t('common.save')}
            nameLabel={t('common.name')}
          />
        )}
      </Modal>
      <Modal
        open={modal === 'members' && !!membersModalGroup}
        onClose={() => { setModal(null); setMembersModalGroup(null); setMembersAddRemove({ add: [], remove: [] }); }}
        title={t('admin.groups.manageMembers') + (membersModalGroup ? `: ${membersModalGroup.name}` : '')}
      >
        {membersModalGroup && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{t('admin.groups.currentMembers')}</p>
            <ul className="list-inside list-disc text-sm">
              {membersModalGroup.members.map((m) => (
                <li key={m.boutiqueId}>
                  {m.boutique.name} ({m.boutique.code})
                  <button
                    type="button"
                    onClick={() => setMembersAddRemove((prev) => ({ ...prev, remove: [...prev.remove, m.boutiqueId] }))}
                    className="ml-2 text-red-600 hover:underline"
                  >
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('admin.groups.addBoutiques')}</label>
              <select
                multiple
                value={membersAddRemove.add}
                onChange={(e) =>
                  setMembersAddRemove((prev) => ({
                    ...prev,
                    add: Array.from(e.target.selectedOptions, (o) => o.value),
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {availableToAdd.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={saveMembers} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700">
                {t('common.save')}
              </button>
              <button
                type="button"
                onClick={() => { setModal(null); setMembersModalGroup(null); }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
