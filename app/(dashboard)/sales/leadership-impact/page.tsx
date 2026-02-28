import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';
import type { Role } from '@prisma/client';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { prisma } from '@/lib/db';
import { formatMonthKey, getRiyadhNow, normalizeMonthKey } from '@/lib/time';
import { computeLeadershipImpact } from '@/lib/sales/leadershipImpact';
import { OpsCard } from '@/components/ui/OpsCard';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const LEADERSHIP_IMPACT_PATH = '/sales/leadership-impact';

function formatSar(n: number): string {
  return n.toLocaleString('en-SA', { maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return (n * 100).toFixed(1);
}

export default async function LeadershipImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; source?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const role = user.role as Role;
  if (!canAccessRoute(role, LEADERSHIP_IMPACT_PATH)) redirect('/dashboard');

  const scope = await getOperationalScope();
  if (!scope?.boutiqueId) redirect('/dashboard');

  const params = await searchParams;
  const monthParam = params.month?.trim();
  const defaultMonth = formatMonthKey(getRiyadhNow());
  const monthKey = monthParam && MONTH_REGEX.test(normalizeMonthKey(monthParam))
    ? normalizeMonthKey(monthParam)
    : defaultMonth;
  const sourceFilter = params.source?.toUpperCase() === 'LEDGER' ? 'LEDGER' : 'ALL';
  const ledgerOnly = sourceFilter === 'LEDGER';

  const entries = await prisma.salesEntry.findMany({
    where: {
      boutiqueId: scope.boutiqueId,
      month: monthKey,
      ...(ledgerOnly ? { source: 'LEDGER' } : {}),
    },
    select: {
      userId: true,
      amount: true,
      user: { select: { empId: true } },
    },
  });

  const rows = entries.map((e) => ({
    userId: e.userId,
    amount: e.amount,
    label: e.user?.empId ?? e.userId,
  }));
  const dto = computeLeadershipImpact({ month: monthKey, rows });

  const baseQuery = `month=${encodeURIComponent(monthKey)}`;
  const linkAll = `/sales/leadership-impact?${baseQuery}&source=ALL`;
  const linkLedger = `/sales/leadership-impact?${baseQuery}&source=LEDGER`;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Leadership Impact</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">{monthKey}</span>
            <span className="text-slate-400">|</span>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              <Link
                href={linkAll}
                className={`rounded-md px-2 py-1 ${sourceFilter === 'ALL' ? 'bg-slate-200 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                All sources
              </Link>
              <Link
                href={linkLedger}
                className={`rounded-md px-2 py-1 ${sourceFilter === 'LEDGER' ? 'bg-slate-200 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                LEDGER only
              </Link>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatSar(dto.total)} SAR</p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Top 1 Share</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatPct(dto.top1Share)}%</p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Top 2 Share</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatPct(dto.top2Share)}%</p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Balance Score</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">
              {(dto.balanceScore * 100).toFixed(0)}%
            </p>
          </OpsCard>
          <OpsCard className="p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Concentration</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{dto.concentrationLevel}</p>
            <p className="text-xs text-slate-500">
              {dto.concentrationLevel === 'HIGH'
                ? 'Top 2 &gt; 70%'
                : dto.concentrationLevel === 'MED'
                  ? 'Top 2 55–70%'
                  : 'Top 2 &lt; 55%'}
            </p>
          </OpsCard>
        </div>

        {/* Team Distribution */}
        <OpsCard title="Team Distribution">
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-2 font-medium">Rank</th>
                  <th className="py-2 pr-2 font-medium">Seller</th>
                  <th className="py-2 pr-2 font-medium text-right">Amount (SAR)</th>
                  <th className="py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {dto.distribution.map((d, i) => (
                  <tr key={d.userId} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-2 text-slate-700">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium text-slate-900">{d.label}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-800">{formatSar(d.total)}</td>
                    <td className="py-1.5 text-right text-slate-700">{formatPct(d.share)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dto.distribution.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-500">No sales data for this month and source.</p>
          )}
        </OpsCard>

        {/* Flags */}
        <OpsCard title="Coaching flags">
          {dto.flags.length === 0 ? (
            <p className="text-sm text-slate-600">No coaching risk flags detected for this month.</p>
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

        {/* Narrative */}
        <OpsCard title="Summary">
          <p className="text-sm leading-relaxed text-slate-700">{dto.narrative}</p>
        </OpsCard>
      </div>
    </div>
  );
}
