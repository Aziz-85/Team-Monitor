/**
 * Performance Hub — reporting target (calendar daily allocation) for arbitrary date ranges.
 * Uses getDailyTargetForDay (integer SAR, same model as trajectory / analytics).
 */

import { prisma } from '@/lib/db';
import { addDays, formatMonthKey, getDaysInMonth, normalizeMonthKey } from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';

function collectMonthKeysInRange(from: Date, toExclusive: Date): string[] {
  const keys = new Set<string>();
  for (let d = new Date(from); d < toExclusive; d = addDays(d, 1)) {
    keys.add(normalizeMonthKey(formatMonthKey(d)));
  }
  return Array.from(keys);
}

export async function sumBoutiqueReportingTargetForRange(
  boutiqueId: string,
  from: Date,
  toExclusive: Date
): Promise<number> {
  const monthKeys = collectMonthKeysInRange(from, toExclusive);
  if (monthKeys.length === 0) return 0;
  const rows = await prisma.boutiqueMonthlyTarget.findMany({
    where: { boutiqueId, month: { in: monthKeys } },
    select: { month: true, amount: true },
  });
  const map = new Map(rows.map((r) => [normalizeMonthKey(r.month), r.amount]));
  let total = 0;
  for (let d = new Date(from); d < toExclusive; d = addDays(d, 1)) {
    const mk = normalizeMonthKey(formatMonthKey(d));
    const monthTarget = map.get(mk) ?? 0;
    const dim = getDaysInMonth(mk);
    const dom = d.getUTCDate();
    total += getDailyTargetForDay(monthTarget, dim, dom);
  }
  return total;
}

export async function sumEmployeeReportingTargetForRange(
  boutiqueId: string,
  userId: string,
  from: Date,
  toExclusive: Date
): Promise<number> {
  const monthKeys = collectMonthKeysInRange(from, toExclusive);
  if (monthKeys.length === 0) return 0;
  const rows = await prisma.employeeMonthlyTarget.findMany({
    where: { boutiqueId, userId, month: { in: monthKeys } },
    select: { month: true, amount: true },
  });
  const map = new Map(rows.map((r) => [normalizeMonthKey(r.month), r.amount]));
  let total = 0;
  for (let d = new Date(from); d < toExclusive; d = addDays(d, 1)) {
    const mk = normalizeMonthKey(formatMonthKey(d));
    const monthTarget = map.get(mk) ?? 0;
    const dim = getDaysInMonth(mk);
    const dom = d.getUTCDate();
    total += getDailyTargetForDay(monthTarget, dim, dom);
  }
  return total;
}

/** Sum boutique targets for full calendar months (no proration) — for monthly best-period scans. */
export async function sumBoutiqueMonthlyTargetsForMonths(
  boutiqueId: string,
  monthKeys: string[]
): Promise<number> {
  if (monthKeys.length === 0) return 0;
  const rows = await prisma.boutiqueMonthlyTarget.findMany({
    where: { boutiqueId, month: { in: monthKeys.map(normalizeMonthKey) } },
    select: { amount: true },
  });
  return rows.reduce((s, r) => s + r.amount, 0);
}

export async function sumEmployeeMonthlyTargetsForMonths(
  boutiqueId: string,
  userId: string,
  monthKeys: string[]
): Promise<number> {
  if (monthKeys.length === 0) return 0;
  const rows = await prisma.employeeMonthlyTarget.findMany({
    where: {
      boutiqueId,
      userId,
      month: { in: monthKeys.map(normalizeMonthKey) },
    },
    select: { amount: true },
  });
  return rows.reduce((s, r) => s + r.amount, 0);
}
