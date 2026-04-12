/**
 * Shared Monthly Sales Matrix payload (SalesEntry-backed) for /api/sales/monthly-matrix
 * and admin secure-edit flows.
 */

import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { normalizeMonthKey, addMonths } from '@/lib/time';
import { monthDaysUTC, monthRangeUTCNoon } from '@/lib/dates/safeCalendar';
import { salesEntryWhereForBoutiqueMonths } from '@/lib/sales/readSalesAggregate';

export type MonthlyMatrixEmployee = {
  employeeId: string;
  empId: string;
  name: string;
  active: boolean;
  source: 'active_scope' | 'sales_records';
  /** Present when includeUserIds; null if no User row */
  userId: string | null;
};

export type MonthlyMatrixPayload = {
  scopeId: string;
  month: string;
  includePreviousMonth: boolean;
  range: { startUTC: string; endExclusiveUTC: string };
  employees: MonthlyMatrixEmployee[];
  days: string[];
  matrix: Record<string, Record<string, number | null>>;
  totalsByEmployee: Array<{ employeeId: string; totalSar: number }>;
  totalsByDay: Array<{ date: string; totalSar: number }>;
  grandTotalSar: number;
  diagnostics: {
    salesEntryCount: number;
    employeeCountActive: number;
    employeeCountFromSales: number;
    employeeUnionCount: number;
    ledgerSource: string;
    sourceFilter: string;
  };
};

function buildDays(monthKey: string, includePreviousMonth: boolean): string[] {
  const keys: string[] = [];
  if (includePreviousMonth) {
    const prev = addMonths(monthKey, -1);
    keys.push(...monthDaysUTC(prev));
  }
  keys.push(...monthDaysUTC(monthKey));
  return keys;
}

export async function getMonthlyMatrixPayload(input: {
  boutiqueId: string;
  monthParam: string;
  includePreviousMonth: boolean;
  ledgerOnly?: boolean;
  /** When true, attach User.id per employee row (admin secure edit). */
  includeUserIds?: boolean;
}): Promise<MonthlyMatrixPayload | { error: string }> {
  const MONTH_REGEX = /^\d{4}-\d{2}$/;
  const monthKey = normalizeMonthKey(input.monthParam);
  if (!MONTH_REGEX.test(monthKey)) {
    return { error: 'month must be YYYY-MM' };
  }

  const ledgerOnly = input.ledgerOnly === true;
  const days = buildDays(monthKey, input.includePreviousMonth);
  const months = Array.from(new Set(days.map((d) => d.slice(0, 7))));

  const [entries, activeEmployeesRaw, allEmployeesByEmpIdRaw] = await Promise.all([
    prisma.salesEntry.findMany({
      where: salesEntryWhereForBoutiqueMonths(input.boutiqueId, months, ledgerOnly),
      select: {
        dateKey: true,
        amount: true,
        user: {
          select: {
            empId: true,
          },
        },
      },
    }),
    prisma.employee.findMany({
      where: { boutiqueId: input.boutiqueId, active: true, isSystemOnly: false },
      select: { empId: true, name: true, isSystemOnly: true },
      orderBy: { empId: 'asc' },
    }),
    prisma.employee.findMany({
      select: { empId: true, name: true, isSystemOnly: true },
    }),
  ]);
  const activeEmployees = filterOperationalEmployees(activeEmployeesRaw);
  const allEmployeesByEmpId = new Map(
    filterOperationalEmployees(allEmployeesByEmpIdRaw).map((e) => [e.empId, e.name])
  );

  const employeeIdsFromSales = new Set<string>();
  for (const e of entries) {
    const empId = e.user?.empId;
    if (empId) employeeIdsFromSales.add(empId);
  }

  const activeSet = new Set(activeEmployees.map((e) => e.empId));
  const employees: MonthlyMatrixEmployee[] = [];

  let empIdToUserId = new Map<string, string>();
  if (input.includeUserIds) {
    const allEmpIds = new Set<string>();
    for (const e of activeEmployees) allEmpIds.add(e.empId);
    for (const id of Array.from(employeeIdsFromSales)) allEmpIds.add(id);
    const users = await prisma.user.findMany({
      where: { empId: { in: Array.from(allEmpIds) }, disabled: false },
      select: { id: true, empId: true },
    });
    empIdToUserId = new Map(users.map((u) => [u.empId, u.id]));
  }

  for (const e of activeEmployees) {
    employees.push({
      employeeId: e.empId,
      empId: e.empId,
      name: e.name ?? '',
      active: true,
      source: 'active_scope',
      userId: input.includeUserIds ? (empIdToUserId.get(e.empId) ?? null) : null,
    });
  }
  for (const empId of Array.from(employeeIdsFromSales)) {
    if (activeSet.has(empId)) continue;
    employees.push({
      employeeId: empId,
      empId,
      name: allEmployeesByEmpId.get(empId) ?? '',
      active: false,
      source: 'sales_records',
      userId: input.includeUserIds ? (empIdToUserId.get(empId) ?? null) : null,
    });
  }

  const matrix: Record<string, Record<string, number | null>> = {};
  for (const day of days) {
    matrix[day] = {};
    for (const e of employees) {
      matrix[day][e.employeeId] = null;
    }
  }

  for (const e of entries) {
    const empId = e.user?.empId;
    if (!empId) continue;
    const day = e.dateKey;
    if (!matrix[day]) continue;
    const prev = typeof matrix[day][empId] === 'number' ? (matrix[day][empId] as number) : 0;
    matrix[day][empId] = prev + e.amount;
  }

  const totalsByEmployee: Array<{ employeeId: string; totalSar: number }> = [];
  let grandTotalSar = 0;
  for (const e of employees) {
    let total = 0;
    for (const day of days) {
      const v = matrix[day]?.[e.employeeId];
      if (typeof v === 'number') total += v;
    }
    totalsByEmployee.push({ employeeId: e.employeeId, totalSar: total });
    grandTotalSar += total;
  }

  const totalsByDay: Array<{ date: string; totalSar: number }> = [];
  for (const day of days) {
    let total = 0;
    const row = matrix[day];
    if (row) {
      for (const empId of Object.keys(row)) {
        const v = row[empId];
        if (typeof v === 'number') total += v;
      }
    }
    totalsByDay.push({ date: day, totalSar: total });
  }

  const rStart = monthRangeUTCNoon(months[0] ?? monthKey);
  const rEnd =
    months.length > 1 ? monthRangeUTCNoon(months[months.length - 1]!) : monthRangeUTCNoon(monthKey);

  return {
    scopeId: input.boutiqueId,
    month: monthKey,
    includePreviousMonth: input.includePreviousMonth,
    range: {
      startUTC: rStart.start.toISOString(),
      endExclusiveUTC: rEnd.endExclusive.toISOString(),
    },
    employees,
    days,
    matrix,
    totalsByEmployee,
    totalsByDay,
    grandTotalSar,
    diagnostics: {
      salesEntryCount: entries.length,
      employeeCountActive: activeEmployees.length,
      employeeCountFromSales: employeeIdsFromSales.size,
      employeeUnionCount: employees.length,
      ledgerSource: 'SalesEntry',
      sourceFilter: ledgerOnly ? 'LEDGER' : 'ALL',
    },
  };
}
