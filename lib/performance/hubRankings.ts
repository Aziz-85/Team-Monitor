import type { HubEmployeeRow } from '@/lib/performance/hubEngine';
import type { HubInsightsInput } from '@/lib/performance/hubInsights';

export type HubRankSlot = {
  rank: number;
  userId?: string;
  label: string;
  value: number;
};

export type HubRankings = {
  topSales?: HubRankSlot[];
  topInvoices?: HubRankSlot[];
  topPieces?: HubRankSlot[];
  topAverageTicket?: HubRankSlot[];
  topUPT?: HubRankSlot[];
  coachingCandidates?: HubRankSlot[];
};

const MIN_INVOICES = 5;

type RankableKey = keyof Pick<
  HubEmployeeRow,
  | 'actualSales'
  | 'totalInvoiceCount'
  | 'totalPieceCount'
  | 'averageTicketSar'
  | 'unitsPerTransaction'
  | 'gapSales'
>;

function topK(
  arr: HubEmployeeRow[],
  key: RankableKey,
  k = 3
): HubRankSlot[] {
  return [...arr]
    .filter((x) => {
      const v = x[key];
      return v != null && typeof v === 'number' && Number.isFinite(v);
    })
    .sort((a, b) => {
      const va = a[key] as number;
      const vb = b[key] as number;
      if (vb !== va) return vb - va;
      return a.userId.localeCompare(b.userId);
    })
    .slice(0, k)
    .map((x, i) => ({
      rank: i + 1,
      userId: x.userId,
      label: x.name,
      value: x[key] as number,
    }));
}

/**
 * Leaderboards from hub employee rows only (no extra queries).
 * Intended for `entity === 'employees'`; returns sparse object when `employees` is empty.
 */
export function buildHubRankings(payload: HubInsightsInput): HubRankings {
  const { employees = [] } = payload;
  const out: HubRankings = {};

  if (employees.length === 0) {
    return out;
  }

  const topSales = topK(employees, 'actualSales');
  if (topSales.length > 0) out.topSales = topSales;

  const topInvoices = topK(
    employees.filter((e) => e.totalInvoiceCount > 0),
    'totalInvoiceCount'
  );
  if (topInvoices.length > 0) out.topInvoices = topInvoices;

  const topPieces = topK(
    employees.filter((e) => e.totalPieceCount > 0),
    'totalPieceCount'
  );
  if (topPieces.length > 0) out.topPieces = topPieces;

  const topAverageTicket = topK(
    employees.filter(
      (e) =>
        e.totalInvoiceCount >= MIN_INVOICES &&
        e.averageTicketSar != null &&
        Number.isFinite(e.averageTicketSar)
    ),
    'averageTicketSar'
  );
  if (topAverageTicket.length > 0) out.topAverageTicket = topAverageTicket;

  const topUPT = topK(
    employees.filter(
      (e) =>
        e.totalInvoiceCount >= MIN_INVOICES &&
        e.unitsPerTransaction != null &&
        Number.isFinite(e.unitsPerTransaction)
    ),
    'unitsPerTransaction'
  );
  if (topUPT.length > 0) out.topUPT = topUPT;

  const coachingCandidates = topK(
    employees.filter(
      (e) => e.targetSales > 0 && e.achievementPct < 70
    ),
    'gapSales'
  );
  if (coachingCandidates.length > 0) out.coachingCandidates = coachingCandidates;

  return out;
}
