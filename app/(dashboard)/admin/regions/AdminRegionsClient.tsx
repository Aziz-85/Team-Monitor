'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { Modal } from '@/components/admin/Modal';
import { RegionForm, type RegionFormValues } from '@/components/admin/RegionForm';

type RegionRow = {
  id: string;
  code: string;
  name: string;
  organizationId: string;
  organization: { id: string; code: string; name: string };
  boutiquesCount: number;
};

export function AdminRegionsClient() {
  const { t } = useT();
  const [list, setList] = useState<RegionRow[]>([]);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<RegionRow | null>(null);

  const fetchList = useCallback(() => {
    fetch('/api/admin/regions')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleCreate = useCallback(
    async (values: RegionFormValues) => {
      const res = await fetch('/api/admin/regions', {
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
    async (values: RegionFormValues) => {
      if (!editing) return;
      const res = await fetch('/api/admin/regions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, name: values.name, code: values.code }),
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
      <OpsCard title={t('nav.admin.regions')}>
        <div className="mb-3">
          <button
            type="button"
            onClick={() => { setEditing(null); setModal('add'); }}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90"
          >
            {t('common.add')}
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>{t('common.name')}</AdminTh>
            <AdminTh>Code</AdminTh>
            <AdminTh>{t('admin.regions.organization')}</AdminTh>
            <AdminTh>{t('admin.boutiques.membersCount')}</AdminTh>
            <AdminTh>{t('common.edit')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {list.map((r) => (
              <tr key={r.id}>
                <AdminTd>{r.name}</AdminTd>
                <AdminTd>{r.code}</AdminTd>
                <AdminTd>{r.organization?.name ?? '—'}</AdminTd>
                <AdminTd>{r.boutiquesCount}</AdminTd>
                <AdminTd>
                  <button
                    type="button"
                    onClick={() => { setEditing(r); setModal('edit'); }}
                    className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-subtle"
                  >
                    {t('common.edit')}
                  </button>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      <Modal open={modal === 'add'} onClose={() => setModal(null)} title={t('admin.regions.addRegion')}>
        <RegionForm onSubmit={handleCreate} onCancel={() => setModal(null)} submitLabel={t('common.save')} nameLabel={t('common.name')} />
      </Modal>
      <Modal
        open={modal === 'edit' && !!editing}
        onClose={() => { setModal(null); setEditing(null); }}
        title={t('admin.regions.editRegion')}
      >
        {editing && (
          <RegionForm
            initial={{ name: editing.name, code: editing.code }}
            onSubmit={handleUpdate}
            onCancel={() => { setModal(null); setEditing(null); }}
            submitLabel={t('common.save')}
            nameLabel={t('common.name')}
          />
        )}
      </Modal>
    </div>
  );
}
