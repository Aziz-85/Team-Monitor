/**
 * GET /api/sales/coverage — Smart sales completeness + gaps (scheduled days only, exclude leave).
 * Query: scopeId (optional, defaults to operational boutique), month=YYYY-MM.
 * Returns expected days per employee (scheduled, not leave), recorded days, missing days, flagged gaps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { getMonthRange } from '@/lib/time';
import { formatDateRiyadh } from '@/lib/time';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] as const;

type CoverageByEmployee = {
  employeeId: string;
  name: string;
  expectedDays: string[];
  recordedDays: string[];
  missingDays: string[];
  flaggedGaps: { from: string; to: string; expectedMissingCount: number }[];
};

type CoverageByDate = {
  date: string;
  expectedEmployees: string[];
  recordedEmployees: string[];
  missingEmployees: string[];
  isFlaggedDate: boolean;
};

export async function GET(request: NextRequest) {
  try {
    await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err?.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const scopeId = scopeResult.boutiqueId;

  const monthParam = request.nextUrl.searchParams.get('month');
  const month = (monthParam ?? '').trim() || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = month.split('-').map(Number);
  if (!Number.isFinite(yearStr) || !Number.isFinite(monthStr) || monthStr < 1 || monthStr > 12) {
    return NextResponse.json({ error: 'Invalid month; use YYYY-MM' }, { status: 400 });
  }

  const { start: monthStart, endExclusive } = getMonthRange(month);
  const monthEnd = new Date(endExclusive.getTime());
  monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);

  const setting = await prisma.scopeSetting.findUnique({
    where: { scopeId },
    select: { maxSalesGapDays: true },
  });
  const maxSalesGapDays = setting?.maxSalesGapDays ?? 7;

  const employees = await prisma.employee.findMany({
    where: buildEmployeeWhereForOperational([scopeId]),
    select: { empId: true, name: true, weeklyOffDay: true },
    orderBy: employeeOrderByStable,
  });

  const leaveRecords = await prisma.leave.findMany({
    where: {
      status: 'APPROVED',
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
      employee: { boutiqueId: scopeId, active: true },
    },
    select: { empId: true, startDate: true, endDate: true },
  });

  const leaveSet = new Set<string>();
  for (const lv of leaveRecords) {
    const start = lv.startDate < monthStart ? monthStart : lv.startDate;
    const end = lv.endDate > monthEnd ? monthEnd : lv.endDate;
    const cur = new Date(start);
    cur.setUTCHours(0, 0, 0, 0);
    const endTime = end.getTime();
    while (cur.getTime() <= endTime) {
      leaveSet.add(`${lv.empId}_${cur.toISOString().slice(0, 10)}`);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const dateKeysInMonth: string[] = [];
  const cur = new Date(monthStart);
  while (cur.getTime() < endExclusive.getTime()) {
    dateKeysInMonth.push(formatDateRiyadh(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const expectedByEmp = new Map<string, string[]>();
  for (const emp of employees) {
    const expected: string[] = [];
    for (const dateKey of dateKeysInMonth) {
      const d = new Date(dateKey + 'T00:00:00Z');
      const dayOfWeek = d.getUTCDay();
          if (dayOfWeek === emp.weeklyOffDay) continue;
          if (leaveSet.has(`${emp.empId}_${dateKey}`)) continue;
          expected.push(dateKey);
        }
    expectedByEmp.set(emp.empId, expected);
  }

  const summaries = await prisma.boutiqueSalesSummary.findMany({
    where: {
      boutiqueId: scopeId,
      date: { gte: monthStart, lt: endExclusive },
    },
    include: { lines: { select: { employeeId: true } } },
  });

  const recordedByEmp = new Map<string, Set<string>>();
  for (const s of summaries) {
    const dateKey = formatDateRiyadh(s.date);
    for (const line of s.lines) {
      let set = recordedByEmp.get(line.employeeId);
      if (!set) {
        set = new Set();
        recordedByEmp.set(line.employeeId, set);
      }
      set.add(dateKey);
    }
  }

  const byEmployee: CoverageByEmployee[] = [];
  let expectedDaysCountTotal = 0;
  let recordedCountTotal = 0;
  const missingDaysByEmp = new Map<string, string[]>();
  const flaggedGapsByEmp = new Map<string, { from: string; to: string; expectedMissingCount: number }[]>();

  for (const emp of employees) {
    const expectedDays = expectedByEmp.get(emp.empId) ?? [];
    const recordedSet = recordedByEmp.get(emp.empId);
    const recordedDays = recordedSet ? Array.from(recordedSet).sort() : [];
    const missingDays = expectedDays.filter((d) => !recordedSet?.has(d)).sort();
    expectedDaysCountTotal += expectedDays.length;
    recordedCountTotal += recordedDays.length;
    missingDaysByEmp.set(emp.empId, missingDays);

    const flaggedGaps: { from: string; to: string; expectedMissingCount: number }[] = [];
    let i = 0;
    while (i < missingDays.length) {
      let j = i + 1;
      while (j < missingDays.length) {
        const prev = missingDays[j - 1];
        const next = missingDays[j];
        const prevDate = new Date(prev + 'T00:00:00Z').getTime();
        const nextDate = new Date(next + 'T00:00:00Z').getTime();
        if (nextDate - prevDate !== 24 * 60 * 60 * 1000) break;
        j++;
      }
      const streakLen = j - i;
      if (streakLen > maxSalesGapDays) {
        flaggedGaps.push({
          from: missingDays[i],
          to: missingDays[j - 1],
          expectedMissingCount: streakLen,
        });
      }
      i = j;
    }
    flaggedGapsByEmp.set(emp.empId, flaggedGaps);

    byEmployee.push({
      employeeId: emp.empId,
      name: emp.name,
      expectedDays,
      recordedDays,
      missingDays,
      flaggedGaps,
    });
  }

  const completenessPct =
    expectedDaysCountTotal > 0
      ? Math.round((recordedCountTotal / expectedDaysCountTotal) * 10000) / 100
      : 100;

  const flaggedDateSet = new Set<string>();
  for (const [empId, gaps] of Array.from(flaggedGapsByEmp)) {
    for (const g of gaps) {
      const d = new Date(g.from + 'T00:00:00Z');
      const end = new Date(g.to + 'T00:00:00Z');
      while (d.getTime() <= end.getTime()) {
        flaggedDateSet.add(`${d.toISOString().slice(0, 10)}_${empId}`);
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
  }

  const byDate: CoverageByDate[] = dateKeysInMonth.map((dateKey) => {
    const expectedEmployees: string[] = [];
    const recordedEmployees: string[] = [];
    for (const emp of employees) {
      const expected = expectedByEmp.get(emp.empId) ?? [];
      if (expected.includes(dateKey)) expectedEmployees.push(emp.empId);
      if (recordedByEmp.get(emp.empId)?.has(dateKey)) recordedEmployees.push(emp.empId);
    }
    const missingEmployees = expectedEmployees.filter((e) => !recordedEmployees.includes(e));
    const isFlaggedDate = missingEmployees.some((e) => flaggedDateSet.has(`${dateKey}_${e}`));
    return {
      date: dateKey,
      expectedEmployees,
      recordedEmployees,
      missingEmployees,
      isFlaggedDate,
    };
  });

  return NextResponse.json({
    scopeId,
    month,
    maxSalesGapDays,
    employees: employees.map((e) => ({ id: e.empId, empId: e.empId, name: e.name })),
    expectedDaysCountTotal,
    recordedCountTotal,
    completenessPct,
    byEmployee,
    byDate,
    diagnostics: {
      scheduleSource: 'roster (weeklyOffDay + Leave APPROVED)',
      leaveSource: 'Leave (status APPROVED)',
    },
  });
}
