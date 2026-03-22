/**
 * Sales attribution — single source of truth for branch and employee totals.
 *
 * RULES:
 * - Branch totals: ALWAYS filter by SalesEntry.boutiqueId (sale location). Never use Employee.boutiqueId.
 * - Employee totals: ALWAYS filter by SalesEntry.userId (seller) across ALL boutiques.
 * - Coverage: employee from A selling in B → branch B total includes it; employee total includes it.
 * - Transfer: do not rewrite historical SalesEntry; totals remain stable.
 *
 * All amounts SAR_INT. Dates use canonical dateKey (YYYY-MM-DD Riyadh).
 * Include all SalesEntry rows; `source` is not used to filter reporting totals.
 */

import { prisma } from '@/lib/db';
import { toRiyadhDateString } from '@/lib/time';

export type DateRange = {
  fromDate: Date;
  toDate: Date;
};

function toDateKey(d: Date): string {
  return toRiyadhDateString(d);
}

/**
 * Sum sales for a branch (sale location). ONLY SalesEntry.boutiqueId.
 */
export async function sumBoutiqueSales(params: {
  boutiqueId: string;
  fromDate: Date;
  toDate: Date;
}): Promise<number> {
  const fromKey = toDateKey(params.fromDate);
  const toKey = toDateKey(params.toDate);
  const agg = await prisma.salesEntry.aggregate({
    where: {
      boutiqueId: params.boutiqueId,
      dateKey: { gte: fromKey, lte: toKey },
    },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Sum sales for an employee (seller) across ALL boutiques. ONLY SalesEntry.userId.
 */
export async function sumEmployeeSales(params: {
  userId: string;
  fromDate: Date;
  toDate: Date;
}): Promise<number> {
  const fromKey = toDateKey(params.fromDate);
  const toKey = toDateKey(params.toDate);
  const agg = await prisma.salesEntry.aggregate({
    where: {
      userId: params.userId,
      dateKey: { gte: fromKey, lte: toKey },
    },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export type BoutiqueAmount = {
  boutiqueId: string;
  amount: number;
};

/**
 * Sum sales for an employee (seller) grouped by boutique (sale location).
 */
export async function sumEmployeeSalesByBoutique(params: {
  userId: string;
  fromDate: Date;
  toDate: Date;
}): Promise<BoutiqueAmount[]> {
  const fromKey = toDateKey(params.fromDate);
  const toKey = toDateKey(params.toDate);
  const rows = await prisma.salesEntry.groupBy({
    by: ['boutiqueId'],
    where: {
      userId: params.userId,
      dateKey: { gte: fromKey, lte: toKey },
    },
    _sum: { amount: true },
  });
  return rows.map((r) => ({
    boutiqueId: r.boutiqueId,
    amount: r._sum.amount ?? 0,
  }));
}

export type EmployeeAmount = {
  userId: string;
  amount: number;
};

/**
 * Sum sales for a branch (sale location) grouped by employee (seller).
 */
export async function sumBoutiqueSalesByEmployee(params: {
  boutiqueId: string;
  fromDate: Date;
  toDate: Date;
}): Promise<EmployeeAmount[]> {
  const fromKey = toDateKey(params.fromDate);
  const toKey = toDateKey(params.toDate);
  const rows = await prisma.salesEntry.groupBy({
    by: ['userId'],
    where: {
      boutiqueId: params.boutiqueId,
      dateKey: { gte: fromKey, lte: toKey },
    },
    _sum: { amount: true },
  });
  return rows.map((r) => ({
    userId: r.userId,
    amount: r._sum.amount ?? 0,
  }));
}
