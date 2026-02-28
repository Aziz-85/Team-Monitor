'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Template = { id: string; code: string; name: string; version: string; updatedAt: string };

export function AdminKpiTemplatesClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    fetch('/api/kpi/templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const seedOfficial = () => {
    setSeeding(true);
    fetch('/api/kpi/templates/seed-official', { method: 'POST' })
      .then((r) => r.json())
      .then(() => fetchTemplates())
      .finally(() => setSeeding(false));
  };

  const official = templates.find((x) => x.code === 'KPI_SALES_EVAL_V1');

  return (
    <div className="min-w-0 p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">{t('kpi.templatesTitle')}</h1>
      {loading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      {!loading && (
        <OpsCard title={t('kpi.officialTemplate')}>
          {official ? (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium text-slate-700">{t('common.name')}:</span> {official.name}</p>
              <p><span className="font-medium text-slate-700">Code:</span> {official.code}</p>
              <p><span className="font-medium text-slate-700">{t('kpi.version')}:</span> {official.version}</p>
              <p><span className="font-medium text-slate-700">{t('kpi.lastUpdate')}:</span> {new Date(official.updatedAt).toLocaleString()}</p>
            </div>
          ) : (
            <p className="text-slate-600">{t('kpi.noOfficialTemplate')}</p>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={seedOfficial}
              disabled={seeding}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? t('common.loading') : t('kpi.seedRepairOfficial')}
            </button>
          </div>
        </OpsCard>
      )}
    </div>
  );
}
