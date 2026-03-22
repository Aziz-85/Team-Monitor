/**
 * Canonical **SalesEntry** read layer for business KPIs (dashboard, summary, metrics, targets, matrix).
 * Endpoints remain thin wrappers; they compose `Prisma.SalesEntryWhereInput` here and call aggregate/groupBy.
 *
 * Rules: SAR integer amounts; **no** `source` filter; use `normalizeMonthKey` / existing Riyadh helpers from callers.
 *
 * **Integrity / governance:** `parityContracts.ts`, `parityEngine.ts`, `salesGovernance.ts`
 * (approved surfaces + dev hints). New business-facing totals should use helpers here — see `docs/sales-parity-surface-audit.md`.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';

/**
 * Half-open date range on `SalesEntry.date` (matches metrics `getSalesMetrics`: `gte` from, `lt` toExclusive).
 */
export function salesEntryWhereDateRangeHalfOpen(params: {
  from: Date;
  toExclusive: Date;
  boutiqueId?: string | null;
  userId?: string | null;
}): Prisma.SalesEntryWhereInput {
  const w: Prisma.SalesEntryWhereInput = {
    date: { gte: params.from, lt: params.toExclusive },
  };
  if (params.boutiqueId) w.boutiqueId = params.boutiqueId;
  if (params.userId) w.userId = params.userId;
  return w;
}

/**
 * Inclusive end date on `SalesEntry.date` (matches `/api/sales/summary` legacy contract).
 */
export function salesEntryWhereDateRangeInclusive(params: {
  from: Date;
  to: Date;
  boutiqueId?: string;
  userId?: string;
}): Prisma.SalesEntryWhereInput {
  const w: Prisma.SalesEntryWhereInput = {
    date: { gte: params.from, lte: params.to },
  };
  if (params.userId) w.userId = params.userId;
  else if (params.boutiqueId) w.boutiqueId = params.boutiqueId;
  return w;
}

export function salesEntryWhereForBoutiqueMonth(
  boutiqueId: string,
  monthKey: string
): Prisma.SalesEntryWhereInput {
  return { boutiqueId, month: normalizeMonthKey(monthKey) };
}

/** Optional `userId` restricts to one employee within the boutique (dashboard employee view). */
export function salesEntryWhereForBoutiqueMonthOptionalUser(
  boutiqueId: string,
  monthKey: string,
  userId?: string | null
): Prisma.SalesEntryWhereInput {
  const base = salesEntryWhereForBoutiqueMonth(boutiqueId, monthKey);
  return userId ? { ...base, userId } : base;
}

export function salesEntryWhereForUserMonth(
  userId: string,
  monthKey: string,
  boutiqueId?: string | null
): Prisma.SalesEntryWhereInput {
  const mk = normalizeMonthKey(monthKey);
  if (boutiqueId != null && boutiqueId !== '') {
    return { userId, boutiqueId, month: mk };
  }
  return { userId, month: mk };
}

/**
 * Same month-scoping as `getPerformanceSummary` / `getDashboardSalesMetrics` (month column + boutique/user).
 */
export function salesEntryWherePerformanceMonth(input: {
  monthKey: string;
  boutiqueId?: string;
  userId?: string | null;
  employeeOnly?: boolean;
  employeeCrossBoutique?: boolean;
}): Prisma.SalesEntryWhereInput {
  const month = normalizeMonthKey(input.monthKey);
  const w: Prisma.SalesEntryWhereInput = { month };
  const uid = input.userId ?? undefined;
  if (input.employeeCrossBoutique && uid) {
    w.userId = uid;
  } else if (input.boutiqueId) {
    w.boutiqueId = input.boutiqueId;
    if (input.employeeOnly && uid) w.userId = uid;
  }
  return w;
}

export async function aggregateSalesEntrySum(where: Prisma.SalesEntryWhereInput): Promise<number> {
  const r = await prisma.salesEntry.aggregate({ where, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

/** Multi-boutique scope + calendar month (executive KPIs, compare). */
export function salesEntryWhereForBoutiquesInMonth(
  monthKey: string,
  boutiqueIds: string[]
): Prisma.SalesEntryWhereInput {
  return {
    month: normalizeMonthKey(monthKey),
    boutiqueId: { in: boutiqueIds },
  };
}

export async function aggregateSalesEntrySumForBoutiquesMonth(
  monthKey: string,
  boutiqueIds: string[]
): Promise<number> {
  if (boutiqueIds.length === 0) return 0;
  return aggregateSalesEntrySum(salesEntryWhereForBoutiquesInMonth(monthKey, boutiqueIds));
}

/** All months with per-month totals for scoped boutiques (executive trend). */
export async function groupSalesSumByMonthForScopedBoutiques(boutiqueIds: string[]) {
  if (boutiqueIds.length === 0) return [];
  return prisma.salesEntry.groupBy({
    by: ['month'],
    where: { boutiqueId: { in: boutiqueIds } },
    _sum: { amount: true },
  });
}

/** Per-boutique revenue for one month (executive compare). */
export async function groupSalesSumByBoutiqueForMonth(monthKey: string, boutiqueIds: string[]) {
  if (boutiqueIds.length === 0) return [];
  return prisma.salesEntry.groupBy({
    by: ['boutiqueId'],
    where: { month: normalizeMonthKey(monthKey), boutiqueId: { in: boutiqueIds } },
    _sum: { amount: true },
  });
}

/** Boutique + month + date range (stricter than month column alone when reconciling). */
export function salesEntryWhereForBoutiqueMonthDateRange(
  boutiqueId: string,
  monthKey: string,
  monthStart: Date,
  monthEndExclusive: Date
): Prisma.SalesEntryWhereInput {
  return {
    boutiqueId,
    month: normalizeMonthKey(monthKey),
    date: { gte: monthStart, lt: monthEndExclusive },
  };
}

/** Group by source with canonical `where` (monthly board SalesEntry breakdown). */
export async function groupSalesEntryBySource(where: Prisma.SalesEntryWhereInput) {
  return prisma.salesEntry.groupBy({
    by: ['source'],
    where,
    _sum: { amount: true },
    _count: { id: true },
  });
}

/** Employee annual slice: one year, scoped boutiques (executive employee detail). */
export async function groupSalesSumByMonthForUserInBoutiquesYear(
  userId: string,
  year: string,
  boutiqueIds: string[]
) {
  if (boutiqueIds.length === 0) return [];
  return prisma.salesEntry.groupBy({
    by: ['month'],
    where: {
      userId,
      boutiqueId: { in: boutiqueIds },
      month: { gte: `${year}-01`, lte: `${year}-12` },
    },
    _sum: { amount: true },
  });
}

export async function groupSalesSumByBoutiqueForUserYear(
  userId: string,
  year: string,
  boutiqueIds: string[]
) {
  if (boutiqueIds.length === 0) return [];
  return prisma.salesEntry.groupBy({
    by: ['boutiqueId'],
    where: {
      userId,
      boutiqueId: { in: boutiqueIds },
      month: { gte: `${year}-01`, lte: `${year}-12` },
    },
    _sum: { amount: true },
  });
}

export async function groupSalesByUserForBoutiqueMonth(
  boutiqueId: string,
  monthKey: string,
  userId?: string | null
) {
  return prisma.salesEntry.groupBy({
    by: ['userId'],
    where: salesEntryWhereForBoutiqueMonthOptionalUser(boutiqueId, monthKey, userId ?? undefined),
    _sum: { amount: true },
  });
}

/** Matrix: boutique + months (+ optional LEDGER-only). */
export function salesEntryWhereForBoutiqueMonths(
  boutiqueId: string,
  months: string[],
  ledgerOnly: boolean
): Prisma.SalesEntryWhereInput {
  const normalized = months.map((m) => normalizeMonthKey(m));
  return {
    boutiqueId,
    month: { in: normalized },
    ...(ledgerOnly ? { source: 'LEDGER' } : {}),
  };
}

/** YTD-style month buckets for one employee (all boutiques). */
export async function groupSalesSumByMonthForUser(userId: string, monthKeys: string[]) {
  const normalized = monthKeys.map((m) => normalizeMonthKey(m));
  return prisma.salesEntry.groupBy({
    by: ['month'],
    where: { userId, month: { in: normalized } },
    _sum: { amount: true },
  });
}

export async function getSalesMetricsFromSalesEntry(input: {
  boutiqueId?: string | null;
  userId?: string | null;
  from: Date;
  toExclusive: Date;
}): Promise<{
  netSalesTotal: number;
  entriesCount: number;
  byDateKey: Record<string, number>;
}> {
  const where = salesEntryWhereDateRangeHalfOpen({
    from: input.from,
    toExclusive: input.toExclusive,
    boutiqueId: input.boutiqueId ?? undefined,
    userId: input.userId ?? undefined,
  });

  const [agg, byDate] = await Promise.all([
    prisma.salesEntry.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['dateKey'],
      where,
      _sum: { amount: true },
    }),
  ]);

  const byDateKey: Record<string, number> = {};
  for (const row of byDate) {
    byDateKey[row.dateKey] = row._sum?.amount ?? 0;
  }

  return {
    netSalesTotal: agg._sum?.amount ?? 0,
    entriesCount: typeof agg._count === 'object' && agg._count && 'id' in agg._count ? agg._count.id : 0,
    byDateKey,
  };
}
