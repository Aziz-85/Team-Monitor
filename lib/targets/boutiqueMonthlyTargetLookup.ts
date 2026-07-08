import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';

export type BoutiqueMonthlyTargetLookup = {
  hasTarget: boolean;
  amount: number | null;
  month: string;
  boutiqueId: string;
};

export async function lookupBoutiqueMonthlyTarget(input: {
  boutiqueId: string;
  monthKey: string;
  routeName: string;
}): Promise<BoutiqueMonthlyTargetLookup> {
  const month = normalizeMonthKey(input.monthKey);
  const row = await prisma.boutiqueMonthlyTarget.findFirst({
    where: { boutiqueId: input.boutiqueId, month },
    select: { amount: true },
  });

  if (!row) {
    console.warn('[targets/sales] missing monthly target', {
      boutiqueId: input.boutiqueId,
      month,
      route: input.routeName,
    });
    return {
      hasTarget: false,
      amount: null,
      month,
      boutiqueId: input.boutiqueId,
    };
  }

  return {
    hasTarget: true,
    amount: row.amount,
    month,
    boutiqueId: input.boutiqueId,
  };
}

export async function sumBoutiqueMonthlyTargets(input: {
  boutiqueIds: string[];
  monthKey: string;
  routeName: string;
}): Promise<BoutiqueMonthlyTargetLookup> {
  const month = normalizeMonthKey(input.monthKey);
  if (input.boutiqueIds.length === 0) {
    return { hasTarget: false, amount: null, month, boutiqueId: '' };
  }

  const rows = await prisma.boutiqueMonthlyTarget.findMany({
    where: { boutiqueId: { in: input.boutiqueIds }, month },
    select: { amount: true, boutiqueId: true },
  });

  if (rows.length === 0) {
    console.warn('[targets/sales] missing monthly target', {
      boutiqueIds: input.boutiqueIds,
      month,
      route: input.routeName,
    });
    return {
      hasTarget: false,
      amount: null,
      month,
      boutiqueId: input.boutiqueIds[0],
    };
  }

  return {
    hasTarget: true,
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    month,
    boutiqueId: input.boutiqueIds[0],
  };
}
