/**
 * Guest shifts for schedule planning (manual external coverage already saved).
 * External employees are never auto-added by the planner — manual Add External Coverage only.
 */

import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { notDisabledUserWhere } from '@/lib/employeeWhere';

export type GuestShiftInput = {
  id?: string;
  empId: string;
  employeeName: string;
  date: string;
  shift: string;
  sourceBoutiqueId?: string;
};

export type ExternalCandidate = {
  empId: string;
  name: string;
  boutiqueId: string;
  boutiqueName: string;
};

function weekRange(weekStart: string): { first: Date; last: Date } {
  const first = new Date(weekStart + 'T00:00:00Z');
  const last = new Date(first);
  last.setUTCDate(last.getUTCDate() + 6);
  return { first, last };
}

export async function loadWeekGuestShifts(
  weekStart: string,
  hostBoutiqueIds: string[]
): Promise<GuestShiftInput[]> {
  if (!hostBoutiqueIds.length) return [];
  const { first, last } = weekRange(weekStart);
  const overrides = await prisma.shiftOverride.findMany({
    where: {
      boutiqueId: { in: hostBoutiqueIds },
      date: { gte: first, lte: last },
      isActive: true,
      overrideShift: { in: ['MORNING', 'EVENING', 'SPLIT'] },
      employee: {
        boutiqueId: { notIn: hostBoutiqueIds },
        active: true,
      },
    },
    select: {
      id: true,
      empId: true,
      date: true,
      overrideShift: true,
      sourceBoutiqueId: true,
      employee: { select: { name: true, boutiqueId: true } },
    },
    orderBy: [{ date: 'asc' }, { empId: 'asc' }],
  });

  return overrides.map((o) => ({
    id: o.id,
    empId: o.empId,
    employeeName: o.employee.name,
    date: o.date.toISOString().slice(0, 10),
    shift: o.overrideShift,
    sourceBoutiqueId: o.sourceBoutiqueId ?? o.employee.boutiqueId,
  }));
}

export async function loadExternalCandidates(hostBoutiqueIds: string[]): Promise<ExternalCandidate[]> {
  if (!hostBoutiqueIds.length) return [];
  const employeesRaw = await prisma.employee.findMany({
    where: {
      active: true,
      isSystemOnly: false,
      boutiqueId: { notIn: hostBoutiqueIds },
      ...notDisabledUserWhere,
    },
    select: {
      empId: true,
      name: true,
      boutiqueId: true,
      isSystemOnly: true,
      boutique: { select: { name: true } },
    },
    orderBy: employeeOrderByStable,
  });
  return filterOperationalEmployees(employeesRaw).map((e) => ({
    empId: e.empId,
    name: e.name,
    boutiqueId: e.boutiqueId,
    boutiqueName: e.boutique?.name ?? '',
  }));
}

export function mergeGuestCountsIntoDayCounts(
  counts: Array<{ amCount: number; pmCount: number; rashidAmCount: number; rashidPmCount: number }>,
  days: Array<{ date: string }>,
  guests: GuestShiftInput[]
): typeof counts {
  const result = counts.map((c) => ({ ...c }));
  for (const g of guests) {
    const i = days.findIndex((d) => d.date === g.date);
    if (i < 0) continue;
    const s = g.shift.toUpperCase();
    if (s === 'MORNING') result[i].amCount++;
    else if (s === 'EVENING') result[i].pmCount++;
    else if (s === 'SPLIT') {
      result[i].amCount++;
      result[i].pmCount++;
    }
  }
  return result;
}
