import { prisma } from '@/lib/db';
import { normalizeMonthKey } from '@/lib/time';
import type { ResolvedEmployeeTarget } from '@/lib/targets/types';

export type GetEmployeeTargetInput = {
  userId: string;
  monthKey: string;
  routeName: string;
  /** When set and crossBoutique is false, scope target to this boutique. */
  boutiqueId?: string;
  /** Sum employee targets across all boutiques for the month. */
  crossBoutique?: boolean;
};

function missingEmployeeTarget(
  input: GetEmployeeTargetInput,
  monthKey: string
): ResolvedEmployeeTarget {
  console.warn('[targets/employee] missing monthly target', {
    userId: input.userId,
    boutiqueId: input.boutiqueId ?? null,
    month: monthKey,
    route: input.routeName,
    crossBoutique: input.crossBoutique ?? false,
  });
  return {
    status: 'missing',
    amountSar: null,
    hasMonthlyTarget: false,
    monthKey,
    userId: input.userId,
    boutiqueId: input.boutiqueId ?? null,
    leaveDaysInMonth: null,
    presenceFactor: null,
    scheduledDaysInMonth: null,
  };
}

/** Central employee monthly target resolver. Missing rows → status `missing`, not zero. */
export async function getEmployeeTarget(
  input: GetEmployeeTargetInput
): Promise<ResolvedEmployeeTarget> {
  const monthKey = normalizeMonthKey(input.monthKey);

  if (input.crossBoutique) {
    const rows = await prisma.employeeMonthlyTarget.findMany({
      where: { userId: input.userId, month: monthKey },
      select: { amount: true },
    });
    if (rows.length === 0) {
      return missingEmployeeTarget(input, monthKey);
    }
    return {
      status: 'assigned',
      amountSar: rows.reduce((sum, row) => sum + row.amount, 0),
      hasMonthlyTarget: true,
      monthKey,
      userId: input.userId,
      boutiqueId: null,
      leaveDaysInMonth: null,
      presenceFactor: null,
      scheduledDaysInMonth: null,
    };
  }

  if (!input.boutiqueId) {
    throw new Error('getEmployeeTarget requires boutiqueId when crossBoutique is false');
  }

  const row = await prisma.employeeMonthlyTarget.findFirst({
    where: {
      boutiqueId: input.boutiqueId,
      month: monthKey,
      userId: input.userId,
    },
    select: {
      amount: true,
      leaveDaysInMonth: true,
      presenceFactor: true,
      scheduledDaysInMonth: true,
    },
  });

  if (!row) {
    return missingEmployeeTarget(input, monthKey);
  }

  return {
    status: 'assigned',
    amountSar: row.amount,
    hasMonthlyTarget: true,
    monthKey,
    userId: input.userId,
    boutiqueId: input.boutiqueId,
    leaveDaysInMonth: row.leaveDaysInMonth,
    presenceFactor: row.presenceFactor,
    scheduledDaysInMonth: row.scheduledDaysInMonth,
  };
}
