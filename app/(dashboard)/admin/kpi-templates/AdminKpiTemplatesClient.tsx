'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';

type Template = { id: string; code: string; name: string; version: string; updatedAt: string };

export function AdminKpiTemplatesClient() {
  const { t } = useT();
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
      <h1 className="mb-4 text-xl font-semibold text-foreground">{t('kpi.templatesTitle')}</h1>
      {loading && <p className="text-sm text-muted">{t('common.loading')}</p>}
      {!loading && (
        <OpsCard title={t('kpi.officialTemplate')}>
          {official ? (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium text-foreground">{t('common.name')}:</span> {official.name}</p>
              <p><span className="font-medium text-foreground">Code:</span> {official.code}</p>
              <p><span className="font-medium text-foreground">{t('kpi.version')}:</span> {official.version}</p>
              <p><span className="font-medium text-foreground">{t('kpi.lastUpdate')}:</span> {new Date(official.updatedAt).toLocaleString()}</p>
            </div>
          ) : (
            <p className="text-muted">{t('kpi.noOfficialTemplate')}</p>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={seedOfficial}
              disabled={seeding}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
            >
              {seeding ? t('common.loading') : t('kpi.seedRepairOfficial')}
            </button>
          </div>
        </OpsCard>
      )}
    </div>
  );
}
