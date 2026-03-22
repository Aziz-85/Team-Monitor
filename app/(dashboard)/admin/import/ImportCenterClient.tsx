'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { HistoricalSalesImportCards } from './HistoricalSalesImportCards';

type BoutiqueOpt = { id: string; code: string | null; name: string | null };

function downloadUrl(path: string) {
  window.open(path, '_blank', 'noopener,noreferrer');
}

export function ImportCenterClient() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const [boutiques, setBoutiques] = useState<BoutiqueOpt[]>([]);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/boutiques?active=true');
        if (!res.ok) {
          setLoadErr(t('admin.importCenter.boutiquesLoadFailed'));
          return;
        }
        const data = (await res.json()) as BoutiqueOpt[];
        if (!cancelled) {
          setBoutiques(data);
          setBoutiqueId((prev) => prev || data[0]?.id || '');
        }
      } catch {
        if (!cancelled) setLoadErr(t('admin.importCenter.boutiquesLoadFailed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const focus = searchParams.get('focus') ?? '';

  const tmpl = useCallback(
    (path: string, extra?: Record<string, string>) => {
      if (!boutiqueId) return;
      const u = new URL(path, window.location.origin);
      u.searchParams.set('boutiqueId', boutiqueId);
      if (extra) Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
      downloadUrl(u.pathname + u.search);
    },
    [boutiqueId]
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-xl font-semibold text-foreground">{t('admin.importCenter.title')}</h1>
        <p className="mb-4 text-sm text-muted">{t('admin.importCenter.intro')}</p>

        {focus === 'historical' ? (
          <p className="mb-4 rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground">
            {t('admin.importCenter.legacyHistoricalNote')}
          </p>
        ) : null}

        <OpsCard className="mb-6 space-y-3 p-4">
          <h2 className="text-sm font-medium text-foreground">{t('admin.importCenter.scope')}</h2>
          {loadErr ? <p className="text-sm text-red-600">{loadErr}</p> : null}
          <label className="block text-xs text-muted">
            {t('admin.importCenter.boutique')}
            <select
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
            >
              {boutiques.map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.code ?? b.id).slice(0, 12)} — {b.name ?? b.id}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-muted">
              {t('admin.importCenter.month')}
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted">
              {t('admin.importCenter.year')}
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
          </div>
        </OpsCard>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {t('admin.importCenter.historicalDbSection')}
          </h2>
          <HistoricalSalesImportCards
            boutiqueId={boutiqueId}
            year={year}
            onDownloadInitial={() =>
              tmpl('/api/admin/import-center/templates/historical-sales-initial', { year })
            }
            onDownloadCorrection={() =>
              tmpl('/api/admin/import-center/templates/historical-sales-correction', { year })
            }
          />
          <p className="mt-2 text-xs text-muted">{t('admin.importCenter.histSnapshotVsDbNote')}</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t('admin.importCenter.salesSection')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <OpsCard className="space-y-2 p-4">
              <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.matrixMonth')}</h3>
              <p className="text-xs text-muted">{t('admin.importCenter.matrixMonthDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!boutiqueId}
                  className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
                  onClick={() => tmpl('/api/admin/import-center/templates/matrix-month', { month })}
                >
                  {t('admin.importCenter.downloadTemplate')}
                </button>
                <Link href="/admin/import/monthly-matrix" className="rounded border border-border px-2 py-1 text-xs">
                  {t('admin.importCenter.openUpload')}
                </Link>
              </div>
            </OpsCard>

            <OpsCard className="space-y-2 p-4">
              <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.yearlySales')}</h3>
              <p className="text-xs text-muted">{t('admin.importCenter.yearlySalesDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!boutiqueId}
                  className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
                  onClick={() => tmpl('/api/admin/import-center/templates/yearly-sales', { year })}
                >
                  {t('admin.importCenter.downloadTemplate')}
                </button>
                <Link href="/admin/import/sales?section=import" className="rounded border border-border px-2 py-1 text-xs">
                  {t('admin.importCenter.salesHub')}
                </Link>
              </div>
            </OpsCard>

            <OpsCard className="space-y-2 p-4">
              <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.simpleSales')}</h3>
              <p className="text-xs text-muted">{t('admin.importCenter.simpleSalesDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!boutiqueId}
                  className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
                  onClick={() => tmpl('/api/admin/import-center/templates/simple-sales')}
                >
                  {t('admin.importCenter.downloadTemplate')}
                </button>
                <Link href="/admin/import/sales?section=import" className="rounded border border-border px-2 py-1 text-xs">
                  {t('admin.importCenter.salesHub')}
                </Link>
              </div>
            </OpsCard>

            <OpsCard className="space-y-2 p-4">
              <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.historicalSnapshot')}</h3>
              <p className="text-xs text-muted">{t('admin.importCenter.historicalSnapshotDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!boutiqueId}
                  className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
                  onClick={() => tmpl('/api/admin/import-center/templates/historical-snapshot', { month })}
                >
                  {t('admin.importCenter.downloadTemplate')}
                </button>
                <Link href="/admin/historical-import" className="rounded border border-border px-2 py-1 text-xs">
                  {t('admin.importCenter.openUpload')}
                </Link>
              </div>
            </OpsCard>
          </div>
          <p className="mt-3 text-xs text-muted">{t('admin.importCenter.salesCanonicalNote')}</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t('admin.importCenter.targetsSection')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <OpsCard className="space-y-2 p-4">
              <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.boutiqueTargets')}</h3>
              <p className="text-xs text-muted">{t('admin.importCenter.boutiqueTargetsDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!boutiqueId}
                  className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
                  onClick={() => tmpl('/api/admin/import-center/templates/boutique-targets')}
                >
                  {t('admin.importCenter.downloadTemplate')}
                </button>
                <Link href="/targets/import" className="rounded border border-border px-2 py-1 text-xs">
                  {t('admin.importCenter.targetsImportUi')}
                </Link>
              </div>
            </OpsCard>

            <OpsCard className="space-y-2 p-4">
              <h3 className="text-sm font-medium text-foreground">{t('admin.importCenter.employeeTargets')}</h3>
              <p className="text-xs text-muted">{t('admin.importCenter.employeeTargetsDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!boutiqueId}
                  className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50"
                  onClick={() => tmpl('/api/admin/import-center/templates/employee-targets', { month })}
                >
                  {t('admin.importCenter.downloadTemplate')}
                </button>
                <Link href="/targets/import" className="rounded border border-border px-2 py-1 text-xs">
                  {t('admin.importCenter.targetsImportUi')}
                </Link>
              </div>
            </OpsCard>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t('admin.importCenter.moreSection')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/admin/import/monthly-snapshot">
              <OpsCard className="h-full p-4 transition-colors hover:bg-surface-subtle">
                <h3 className="text-sm font-medium">{t('admin.import.monthSnapshot')}</h3>
                <p className="text-xs text-muted">{t('admin.import.monthSnapshotDesc')}</p>
              </OpsCard>
            </Link>
            <Link href="/admin/import/issues">
              <OpsCard className="h-full p-4 transition-colors hover:bg-surface-subtle">
                <h3 className="text-sm font-medium">{t('admin.import.importIssues')}</h3>
                <p className="text-xs text-muted">{t('admin.import.importIssuesDesc')}</p>
              </OpsCard>
            </Link>
            <Link href="/admin/import/sales">
              <OpsCard className="h-full p-4 transition-colors hover:bg-surface-subtle">
                <h3 className="text-sm font-medium">{t('admin.import.salesImports')}</h3>
                <p className="text-xs text-muted">{t('admin.import.salesImportsDesc')}</p>
              </OpsCard>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
