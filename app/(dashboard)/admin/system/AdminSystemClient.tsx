'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { DefaultBoutiquePicker } from '@/components/admin/DefaultBoutiquePicker';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Boutique = { id: string; code: string; name: string };

export function AdminSystemClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [current, setCurrent] = useState<{ defaultBoutiqueId: string | null; boutique: Boutique | null }>({
    defaultBoutiqueId: null,
    boutique: null,
  });
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);

  const fetchCurrent = useCallback(() => {
    fetch('/api/admin/system/default-boutique')
      .then((r) => r.json())
      .then((data) => setCurrent({ defaultBoutiqueId: data.defaultBoutiqueId ?? null, boutique: data.boutique ?? null }))
      .catch(() => setCurrent({ defaultBoutiqueId: null, boutique: null }));
  }, []);

  const fetchBoutiques = useCallback(() => {
    fetch('/api/admin/boutiques')
      .then((r) => r.json())
      .then((data) => setBoutiques(Array.isArray(data) ? data.map((b: Boutique) => ({ id: b.id, code: b.code, name: b.name })) : []))
      .catch(() => setBoutiques([]));
  }, []);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);
  useEffect(() => {
    fetchBoutiques();
  }, [fetchBoutiques]);

  const handleSave = useCallback(
    async (boutiqueId: string) => {
      const res = await fetch('/api/admin/system/default-boutique', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      fetchCurrent();
    },
    [fetchCurrent]
  );

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('nav.admin.system')}>
        <DefaultBoutiquePicker
          current={current}
          boutiques={boutiques}
          onSave={handleSave}
          confirmMessage={t('admin.system.confirmDefaultBoutique')}
          saveLabel={t('common.save')}
          titleLabel={t('admin.system.defaultBoutiqueDescription')}
        />
      </OpsCard>
    </div>
  );
}
