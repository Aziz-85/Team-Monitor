import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { prisma } from '@/lib/db';
import { formatMonthKey, getRiyadhNow, normalizeMonthKey } from '@/lib/time';
import { computeLeadershipImpact } from '@/lib/sales/leadershipImpact';
import { LeadershipImpactClient } from './LeadershipImpactClient';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const LEADERSHIP_IMPACT_PATH = '/sales/leadership-impact';

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
    <LeadershipImpactClient
      monthKey={monthKey}
      sourceFilter={sourceFilter}
      linkAll={linkAll}
      linkLedger={linkLedger}
      dto={{
        total: dto.total,
        top1Share: dto.top1Share,
        top2Share: dto.top2Share,
        balanceScore: dto.balanceScore,
        concentrationLevel: dto.concentrationLevel,
        distribution: dto.distribution,
        flags: dto.flags,
        narrative: dto.narrative,
      }}
    />
  );
}
