'use client';

import { useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { useT } from '@/lib/i18n/useT';

type ParityPayload = {
  ok: boolean;
  failedContracts: string[];
  checks: Array<{
    contractName: string;
    status: string;
    delta: number;
    summary: string;
    values: Record<string, number>;
    context: Record<string, string | number | boolean | undefined>;
    message?: string;
  }>;
  generatedAt: string;
  reconciliationPolicy?: {
    id: string;
    label: string;
    summary: string;
    documentationPath: string;
  };
};

export function SalesIntegrityClient() {
  const { t } = useT();
  const [boutiqueId, setBoutiqueId] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parity, setParity] = useState<ParityPayload | null>(null);
  const [statusLite, setStatusLite] = useState<{ ok: boolean; failedContracts: number; lastCheckedAt: string } | null>(
    null
  );

  async function runParity() {
    if (!boutiqueId.trim() || !/^\d{4}-\d{2}$/.test(month)) {
      setError(t('admin.salesIntegrity.needBoutiqueMonth'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ boutiqueId: boutiqueId.trim(), month });
      if (userId.trim()) params.set('userId', userId.trim());
      const [diagRes, stRes] = await Promise.all([
        fetch(`/api/admin/sales-parity-diagnostics?${params}`),
        fetch(`/api/admin/sales-parity-status?${params}`),
      ]);
      if (!diagRes.ok) {
        const j = await diagRes.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? `HTTP ${diagRes.status}`);
        setParity(null);
        setStatusLite(null);
        return;
      }
      const diag = (await diagRes.json()) as ParityPayload;
      setParity(diag);
      if (stRes.ok) {
        setStatusLite(await stRes.json());
      } else {
        setStatusLite(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setParity(null);
      setStatusLite(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-xl font-semibold text-foreground">{t('admin.salesIntegrity.title')}</h1>
        <p className="mb-6 text-sm text-muted">{t('admin.salesIntegrity.blurb')}</p>
        <p className="mb-4 rounded border border-border bg-surface-subtle px-3 py-2 text-xs text-muted">
          {t('admin.salesIntegrity.policyNote')}
        </p>

        <OpsCard className="mb-6 space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-muted">
              boutiqueId
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={boutiqueId}
                onChange={(e) => setBoutiqueId(e.target.value)}
                placeholder="bout_..."
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              month (YYYY-MM)
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-muted sm:col-span-2">
              userId (optional, employee MTD contract)
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="cuid"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runParity()}
            className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {loading ? t('admin.salesIntegrity.running') : t('admin.salesIntegrity.runChecks')}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </OpsCard>

        {statusLite ? (
          <OpsCard className="mb-4 p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">{t('admin.salesIntegrity.status')}</h2>
            <pre className="overflow-x-auto text-xs text-muted">
              {JSON.stringify(statusLite, null, 2)}
            </pre>
          </OpsCard>
        ) : null}

        {parity ? (
          <OpsCard className="p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">{t('admin.salesIntegrity.results')}</h2>
            <p className="mb-3 text-xs text-muted">
              {t('admin.salesIntegrity.generatedAt')}: {parity.generatedAt}
            </p>
            {parity.reconciliationPolicy ? (
              <div className="mb-4 rounded border border-border px-3 py-2 text-xs text-muted">
                <div className="font-medium text-foreground">{parity.reconciliationPolicy.label}</div>
                <p className="mt-1">{parity.reconciliationPolicy.summary}</p>
              </div>
            ) : null}
            <ul className="space-y-2">
              {parity.checks.map((c) => (
                <li
                  key={c.contractName}
                  className={`rounded border px-3 py-2 text-sm ${
                    c.status === 'PASS' ? 'border-green-800/40 bg-green-950/20' : 'border-red-800/40 bg-red-950/20'
                  }`}
                >
                  <div className="font-medium text-foreground">{c.contractName}</div>
                  <div className="text-xs text-muted">{c.summary}</div>
                  {c.delta > 0 ? (
                    <div className="text-xs text-muted">
                      delta: {c.delta} · values: {JSON.stringify(c.values)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </OpsCard>
        ) : null}
      </div>
    </div>
  );
}
