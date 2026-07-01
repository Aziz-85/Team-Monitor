/**
 * Fairness metrics for schedule planning — who already carries extra load.
 */

import { prisma } from '@/lib/db';
import type { GridRow } from './scheduleGrid';
import { FRIDAY_DAY_OF_WEEK } from './shift';

export type FairnessContext = {
  monthlyOverrides: Map<string, number>;
  forceWorkThisMonth: Map<string, number>;
  swapOffThisMonth: Map<string, number>;
};

export type EmployeeFairnessRow = {
  empId: string;
  name: string;
  amDays: number;
  pmDays: number;
  splitDays: number;
  offDays: number;
  leaveDays: number;
  monthlyOverrides: number;
  forceWorkThisMonth: number;
  loadScore: number;
};

export type FairnessWeights = {
  monthlyOverrides: number;
  pmThisWeek: number;
  splitThisWeek: number;
  forceWorkThisMonth: number;
  weeklyOffPenalty: number;
};

export const FAIRNESS_PRESETS: Record<string, { labelKey: string; weights: FairnessWeights }> = {
  balanced: {
    labelKey: 'schedule.assistant.scenarioBalanced',
    weights: { monthlyOverrides: 3, pmThisWeek: 2, splitThisWeek: 1.5, forceWorkThisMonth: 5, weeklyOffPenalty: 4 },
  },
  spread_load: {
    labelKey: 'schedule.assistant.scenarioSpreadLoad',
    weights: { monthlyOverrides: 2, pmThisWeek: 4, splitThisWeek: 2, forceWorkThisMonth: 4, weeklyOffPenalty: 3 },
  },
  min_overrides: {
    labelKey: 'schedule.assistant.scenarioMinOverrides',
    weights: { monthlyOverrides: 6, pmThisWeek: 1, splitThisWeek: 1, forceWorkThisMonth: 3, weeklyOffPenalty: 2 },
  },
};

function weekMonthBounds(weekStart: string): { monthStart: string; monthEnd: string } {
  const d = new Date(weekStart + 'T12:00:00Z');
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { monthStart, monthEnd };
}

export async function loadFairnessContext(weekStart: string, empIds: string[]): Promise<FairnessContext> {
  const { monthStart, monthEnd } = weekMonthBounds(weekStart);
  const monthlyOverrides = new Map<string, number>();
  const forceWorkThisMonth = new Map<string, number>();
  const swapOffThisMonth = new Map<string, number>();

  if (empIds.length === 0) {
    return { monthlyOverrides, forceWorkThisMonth, swapOffThisMonth };
  }

  const [overrideCounts, dayOverrides] = await Promise.all([
    prisma.shiftOverride.groupBy({
      by: ['empId'],
      where: { isActive: true, empId: { in: empIds }, date: { gte: monthStart, lte: monthEnd } },
      _count: { id: true },
    }),
    prisma.employeeDayOverride.findMany({
      where: {
        employeeId: { in: empIds },
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { employeeId: true, mode: true, reason: true },
    }),
  ]);

  for (const row of overrideCounts) {
    monthlyOverrides.set(row.empId, row._count.id);
  }
  for (const o of dayOverrides) {
    if (o.mode === 'FORCE_WORK') {
      forceWorkThisMonth.set(o.employeeId, (forceWorkThisMonth.get(o.employeeId) ?? 0) + 1);
    }
    if (o.mode === 'FORCE_OFF' && (o.reason ?? '').toLowerCase().includes('weekly off swap')) {
      swapOffThisMonth.set(o.employeeId, (swapOffThisMonth.get(o.employeeId) ?? 0) + 1);
    }
  }

  return { monthlyOverrides, forceWorkThisMonth, swapOffThisMonth };
}

export function buildEmployeeFairness(rows: GridRow[], context: FairnessContext): EmployeeFairnessRow[] {
  return rows.map((row) => {
    let amDays = 0;
    let pmDays = 0;
    let splitDays = 0;
    let offDays = 0;
    let leaveDays = 0;

    for (const cell of row.cells) {
      if (cell.availability === 'LEAVE') leaveDays++;
      else if (cell.availability === 'OFF' || cell.availability === 'HOLIDAY') offDays++;
      else if (cell.availability === 'WORK') {
        const s = cell.effectiveShift;
        if (s === 'MORNING' || s === 'COVER_RASHID_AM') amDays++;
        else if (s === 'EVENING' || s === 'COVER_RASHID_PM') pmDays++;
        else if (s === 'SPLIT') splitDays++;
      }
    }

    const monthlyOverrides = context.monthlyOverrides.get(row.empId) ?? 0;
    const forceWorkThisMonth = context.forceWorkThisMonth.get(row.empId) ?? 0;
    const loadScore = pmDays * 2 + splitDays * 2.5 + amDays + monthlyOverrides * 1.5 + forceWorkThisMonth * 3;

    return {
      empId: row.empId,
      name: row.name,
      amDays,
      pmDays,
      splitDays,
      offDays,
      leaveDays,
      monthlyOverrides,
      forceWorkThisMonth,
      loadScore,
    };
  });
}

export function candidateFairnessScore(
  empId: string,
  row: GridRow,
  dayIndex: number,
  context: FairnessContext,
  weekStats: EmployeeFairnessRow | undefined,
  weights: FairnessWeights,
  opts?: { isWeeklyOff?: boolean; movingToPm?: boolean }
): number {
  const monthlyOverrides = context.monthlyOverrides.get(empId) ?? 0;
  const forceWork = context.forceWorkThisMonth.get(empId) ?? 0;
  const pmThisWeek = weekStats?.pmDays ?? 0;
  const splitThisWeek = weekStats?.splitDays ?? 0;

  let score =
    monthlyOverrides * weights.monthlyOverrides +
    forceWork * weights.forceWorkThisMonth +
    pmThisWeek * weights.pmThisWeek +
    splitThisWeek * weights.splitThisWeek;

  if (opts?.isWeeklyOff) {
    score += weights.weeklyOffPenalty * 2;
  }
  if (opts?.movingToPm) {
    score += pmThisWeek * 0.5;
  }

  const cell = row.cells[dayIndex];
  if (cell?.availability === 'LEAVE') score += 100;
  if (cell?.availability === 'HOLIDAY') score += 80;

  return score;
}

export function effectiveMinPm(dayOfWeek: number, ruleMinPm: number): number {
  if (dayOfWeek === FRIDAY_DAY_OF_WEEK) return ruleMinPm;
  return Math.max(ruleMinPm, 2);
}
