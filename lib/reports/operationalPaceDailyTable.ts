/**
 * Operational pace daily table — sequential carry-forward of shortfall only.
 * Distinct from per-day reporting allocation without carry (see month-daily API `rows`).
 *
 * Rules (integer SAR):
 * - baseDailyTarget_d = getDailyTargetForDay(monthTarget, daysInMonth, d) — same calendar spread as reporting base.
 * - carryIn_1 = 0; carryIn_d = max(effective_{d-1} - achieved_{d-1}, 0) for d > 1.
 * - effective_d = base_d + carryIn_d
 * - remaining_d = effective_d - achieved_d (negative = surplus / overachievement)
 * - achievement % = round(achieved * 100 / effective) when effective > 0, else 0
 */

import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';

export type OperationalPaceDailyRow = {
  dateKey: string;
  baseDailyTargetSar: number;
  carryInSar: number;
  effectiveDailyTargetSar: number;
  achievedSar: number;
  remainingSar: number;
  achievementPct: number;
};

export function buildOperationalPaceDailyRows(input: {
  monthKey: string;
  monthTargetSar: number;
  daysInMonth: number;
  achievedByDateKey: Map<string, number>;
}): OperationalPaceDailyRow[] {
  const T = Math.trunc(Number(input.monthTargetSar)) || 0;
  const D = Math.max(0, Math.trunc(input.daysInMonth));
  const [y, m] = input.monthKey.split('-').map(Number);
  const mm = String(m).padStart(2, '0');

  const rows: OperationalPaceDailyRow[] = [];
  let carryIn = 0;

  for (let d = 1; d <= D; d++) {
    const dateKey = `${y}-${mm}-${String(d).padStart(2, '0')}`;
    const base = getDailyTargetForDay(T, D, d);
    const effective = base + carryIn;
    const achieved = Math.trunc(input.achievedByDateKey.get(dateKey) ?? 0) || 0;
    const remaining = effective - achieved;
    const achievementPct =
      effective === 0 ? 0 : Math.round((achieved * 100) / effective);

    rows.push({
      dateKey,
      baseDailyTargetSar: base,
      carryInSar: carryIn,
      effectiveDailyTargetSar: effective,
      achievedSar: achieved,
      remainingSar: remaining,
      achievementPct,
    });

    carryIn = Math.max(0, remaining);
  }

  return rows;
}
