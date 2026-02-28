'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Task = {
  id: string;
  name: string;
  active: boolean;
  boutiqueId: string | null;
  taskPlans?: unknown[];
  taskSchedules?: unknown[];
};

type Boutique = { id: string; code: string; name: string };

export function BoutiqueTasksClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [list, setList] = useState<Task[]>([]);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);

  const fetchList = useCallback(() => {
    fetch('/api/tasks/setup')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setList(data);
        else if (data?.error) setList([]);
        else setList([]);
      })
      .catch(() => setList([]));
  }, []);

  const fetchBoutiques = useCallback(() => {
    fetch('/api/me/boutiques')
      .then((r) => r.json())
      .then((data) => setBoutiques(Array.isArray(data?.boutiques) ? data.boutiques : []))
      .catch(() => setBoutiques([]));
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchBoutiques(); }, [fetchBoutiques]);

  const boutiqueName = (boutiqueId: string | null) => {
    if (!boutiqueId) return '—';
    const b = boutiques.find((x) => x.id === boutiqueId);
    return b ? `${b.name} (${b.code})` : boutiqueId;
  };

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('nav.boutiqueTasks')}>
        <p className="mb-3 text-sm text-slate-600">
          <Link href="/tasks/setup" className="text-sky-600 hover:underline">
            {t('tasks.setup')} — {t('admin.boutiques.details')}
          </Link>
        </p>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>{t('common.name')}</AdminTh>
            <AdminTh>Boutique</AdminTh>
            <AdminTh>{t('adminEmp.active')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {list.map((task) => (
              <tr key={task.id}>
                <AdminTd>
                  <Link href={`/tasks/setup?taskId=${task.id}`} className="text-sky-600 hover:underline truncate block">
                    {task.name}
                  </Link>
                </AdminTd>
                <AdminTd>{boutiqueName(task.boutiqueId)}</AdminTd>
                <AdminTd>{task.active ? t('adminEmp.active') : t('adminEmp.inactive')}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>
    </div>
  );
}
