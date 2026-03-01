'use client';

import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { useT } from '@/lib/i18n/useT';

export type LeadershipImpactDto = {
  total: number;
  top1Share: number;
  top2Share: number;
  balanceScore: number;
  concentrationLevel: string;
  distribution: Array<{ userId: string; label: string; total: number; share: number }>;
  flags: Array<{ code: string; title: string; reason: string }>;
  narrative: string;
};

type Props = {
  monthKey: string;
  sourceFilter: 'ALL' | 'LEDGER';
  linkAll: string;
  linkLedger: string;
  dto: LeadershipImpactDto;
};

function formatSar(n: number): string {
  return n.toLocaleString('en-SA', { maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return (n * 100).toFixed(1);
}

export function LeadershipImpactClient({ monthKey, sourceFilter, linkAll, linkLedger, dto }: Props) {
  const { t } = useT();

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{t('leadershipImpact.title')}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">{monthKey}</span>
            <span className="text-slate-400">|</span>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              <Link
                href={linkAll}
                className={`rounded-md px-2 py-1 ${sourceFilter === 'ALL' ? 'bg-slate-200 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {t('leadershipImpact.allSources')}
              </Link>
              <Link
                href={linkLedger}
                className={`rounded-md px-2 py-1 ${sourceFilter === 'LEDGER' ? 'bg-slate-200 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {t('leadershipImpact.ledgerOnly')}
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('leadershipImpact.total')}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatSar(dto.total)} SAR</p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('leadershipImpact.top1Share')}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatPct(dto.top1Share)}%</p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('leadershipImpact.top2Share')}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatPct(dto.top2Share)}%</p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('leadershipImpact.balanceScore')}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">
              {(dto.balanceScore * 100).toFixed(0)}%
            </p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('leadershipImpact.concentration')}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{dto.concentrationLevel}</p>
            <p className="text-xs text-slate-500">
              {dto.concentrationLevel === 'HIGH'
                ? t('leadershipImpact.concentrationHigh')
                : dto.concentrationLevel === 'MED'
                  ? t('leadershipImpact.concentrationMed')
                  : t('leadershipImpact.concentrationLow')}
            </p>
          </OpsCard>
        </div>

        <OpsCard title={t('leadershipImpact.teamDistribution')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-start text-slate-600">
                  <th className="py-2 pe-2 font-medium">{t('leadershipImpact.rank')}</th>
                  <th className="py-2 pe-2 font-medium">{t('leadershipImpact.seller')}</th>
                  <th className="py-2 pe-2 font-medium text-end">{t('leadershipImpact.amountSar')}</th>
                  <th className="py-2 font-medium text-end">{t('leadershipImpact.share')}</th>
                </tr>
              </thead>
              <tbody>
                {dto.distribution.map((d, i) => (
                  <tr key={d.userId} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pe-2 text-slate-700">{i + 1}</td>
                    <td className="py-1.5 pe-2 font-medium text-slate-900">{d.label}</td>
                    <td className="py-1.5 pe-2 text-end text-slate-800">{formatSar(d.total)}</td>
                    <td className="py-1 text-end text-slate-700">{formatPct(d.share)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dto.distribution.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-500">{t('leadershipImpact.noSalesDataForMonth')}</p>
          )}
        </OpsCard>

        <OpsCard title={t('leadershipImpact.coachingFlags')}>
          {dto.flags.length === 0 ? (
            <p className="text-sm text-slate-600">{t('leadershipImpact.noCoachingFlags')}</p>
          ) : (
            <ul className="space-y-2">
              {dto.flags.map((f) => (
                <li key={f.code} className="rounded border border-amber-200 bg-amber-50 p-2 text-sm">
                  <span className="font-medium text-amber-900">{f.title}</span>
                  <p className="mt-0.5 text-amber-800">{f.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </OpsCard>

        <OpsCard title={t('leadershipImpact.summary')}>
          <p className="text-sm leading-relaxed text-slate-700">{dto.narrative}</p>
        </OpsCard>
      </div>
    </div>
  );
}
