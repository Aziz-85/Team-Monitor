/**
 * Leadership Impact v1 — pure compute from SalesEntry-derived rows.
 * No Prisma/API; used by /sales/leadership-impact page only.
 */

export type LeadershipImpactRow = {
  userId: string;
  amount: number;
  label: string;
};

export type DistributionItem = {
  userId: string;
  label: string;
  total: number;
  share: number;
};

export type ConcentrationLevel = 'HIGH' | 'MED' | 'LOW';

export type ImpactFlag = {
  code: string;
  title: string;
  reason: string;
};

export type LeadershipImpactDTO = {
  month: string;
  total: number;
  distribution: DistributionItem[];
  activeSellers: number;
  top1Share: number;
  top2Share: number;
  top3Share: number;
  balanceScore: number;
  concentrationLevel: ConcentrationLevel;
  flags: ImpactFlag[];
  narrative: string;
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Compute Leadership Impact metrics from aggregated rows (one row per entry; caller aggregates by userId or passes raw entries).
 * Rows are per SalesEntry row; we aggregate by userId inside.
 */
export function computeLeadershipImpact({
  month,
  rows,
}: {
  month: string;
  rows: LeadershipImpactRow[];
}): LeadershipImpactDTO {
  const byUser = new Map<string, { total: number; label: string }>();
  let total = 0;
  for (const r of rows) {
    total += r.amount;
    const cur = byUser.get(r.userId);
    if (!cur) {
      byUser.set(r.userId, { total: r.amount, label: r.label });
    } else {
      cur.total += r.amount;
    }
  }

  const distribution: DistributionItem[] = Array.from(byUser.entries())
    .map(([userId, { total: userTotal, label }]) => ({
      userId,
      label,
      total: userTotal,
      share: total > 0 ? userTotal / total : 0,
    }))
    .sort((a, b) => b.share - a.share);

  const activeSellers = distribution.filter((d) => d.total > 0).length;
  const top1Share = distribution[0]?.share ?? 0;
  const top2Share = (distribution[0]?.share ?? 0) + (distribution[1]?.share ?? 0);
  const top3Share =
    (distribution[0]?.share ?? 0) + (distribution[1]?.share ?? 0) + (distribution[2]?.share ?? 0);

  const avgShare = activeSellers > 0 ? 1 / activeSellers : 0;
  const l1 = distribution.reduce((s, d) => s + Math.abs(d.share - avgShare), 0);
  const balanceScore = clamp(1 - l1 / 2, 0, 1);

  let concentrationLevel: ConcentrationLevel = 'LOW';
  if (top2Share > 0.7) concentrationLevel = 'HIGH';
  else if (top2Share >= 0.55) concentrationLevel = 'MED';

  const flags: ImpactFlag[] = [];
  if (top1Share > 0.45) {
    flags.push({
      code: 'SINGLE_STAR',
      title: 'Single star',
      reason: `Top seller holds ${(top1Share * 100).toFixed(1)}% of sales (${activeSellers} active seller${activeSellers !== 1 ? 's' : ''}).`,
    });
  }
  if (top2Share > 0.7) {
    flags.push({
      code: 'TOP2_DOMINANCE',
      title: 'Top 2 dominance',
      reason: `Top 2 sellers account for ${(top2Share * 100).toFixed(1)}% of sales. Consider broadening contribution.`,
    });
  }
  if (activeSellers < 4 && total > 0) {
    flags.push({
      code: 'LOW_PARTICIPATION',
      title: 'Low participation',
      reason: `Only ${activeSellers} seller${activeSellers !== 1 ? 's' : ''} with sales this month. Target wider team engagement.`,
    });
  }

  let narrative: string;
  switch (concentrationLevel) {
    case 'HIGH':
      narrative = `Sales concentration is high this month: the top two sellers account for over 70% of total sales. Consider coaching and targets to spread contribution across the team.`;
      break;
    case 'MED':
      narrative = `Sales concentration is moderate. The top two sellers hold between 55% and 70% of sales. There is room to improve balance through goals and development.`;
      break;
    default:
      narrative = `Sales are well distributed across the team this month, with the top two sellers under 55% of total. This indicates healthy participation.`;
  }

  return {
    month,
    total,
    distribution,
    activeSellers,
    top1Share,
    top2Share,
    top3Share,
    balanceScore,
    concentrationLevel,
    flags,
    narrative,
  };
}
