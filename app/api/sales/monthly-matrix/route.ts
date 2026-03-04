/**
 * GET /api/sales/monthly-matrix?month=YYYY-MM&includePreviousMonth=true|false&source=LEDGER|ALL
 * Source of truth: SalesEntry (LEDGER, IMPORT, MANUAL). Strict boutique scope via requireOperationalBoutique.
 * Employees = active in scope ∪ any EmpID in SalesEntry for that month range.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey, addMonths } from '@/lib/time';
import { monthDaysUTC, monthRangeUTCNoon, dateKeyUTC } from '@/lib/dates/safeCalendar';

export const dynamic = 'force-dynamic';

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const SALES_ENTRY_SOURCES_ALL = ['LEDGER', 'IMPORT', 'MANUAL'];

/** Build day keys for matrix using safe calendar (no ISO slice). */
function buildDays(monthKey: string, includePreviousMonth: boolean): string[] {
  const keys: string[] = [];
  if (includePreviousMonth) {
    const prev = addMonths(monthKey, -1);
    keys.push(...monthDaysUTC(prev));
  }
  keys.push(...monthDaysUTC(monthKey));
  return keys;
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;

  const scopeId = scope.boutiqueId;
  const monthParam = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const monthKey = normalizeMonthKey(monthParam);
  if (!MONTH_REGEX.test(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const includePreviousMonth =
    request.nextUrl.searchParams.get('includePreviousMonth') === 'true';

  const sourceParam = (request.nextUrl.searchParams.get('source') ?? 'ALL').toUpperCase();
  const ledgerOnly = sourceParam === 'LEDGER';
  const sourceFilter = ledgerOnly ? ['LEDGER'] : SALES_ENTRY_SOURCES_ALL;

  const days = buildDays(monthKey, includePreviousMonth);
  const months = Array.from(
    new Set(days.map((d) => d.slice(0, 7)))
  );

  if (process.env.NODE_ENV !== 'production') {
    const r0 = monthRangeUTCNoon(months[0] ?? monthKey);
    const r1 = months.length > 1 ? monthRangeUTCNoon(months[months.length - 1]!) : r0;
    const endExclusive = r1.endExclusive;
    console.log('[MonthlyMatrix] months', months);
    console.log('[MonthlyMatrix] range', dateKeyUTC(r0.start), dateKeyUTC(new Date(endExclusive.getTime() - 1)));
    console.log('[MonthlyMatrix] days[0..2]', days.slice(0, 3));
  }

  const [entries, activeEmployees, allEmployeesByEmpId] = await Promise.all([
    prisma.salesEntry.findMany({
      where: {
        boutiqueId: scopeId,
        month: { in: months },
        source: { in: sourceFilter },
      },
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
      where: { boutiqueId: scopeId, active: true, isSystemOnly: false },
      select: { empId: true, name: true },
      orderBy: { empId: 'asc' },
    }),
    prisma.employee.findMany({
      select: { empId: true, name: true },
    }).then((list) => new Map(list.map((e) => [e.empId, e.name]))),
  ]);

  const employeeIdsFromSales = new Set<string>();
  for (const e of entries) {
    const empId = e.user?.empId;
    if (empId) employeeIdsFromSales.add(empId);
  }

  const activeSet = new Set(activeEmployees.map((e) => e.empId));
  const employees: Array<{
    employeeId: string;
    empId: string;
    name: string;
    active: boolean;
    source: 'active_scope' | 'sales_records';
  }> = [];
  for (const e of activeEmployees) {
    employees.push({
      employeeId: e.empId,
      empId: e.empId,
      name: e.name ?? '',
      active: true,
      source: 'active_scope',
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
  const rEnd = months.length > 1 ? monthRangeUTCNoon(months[months.length - 1]!) : monthRangeUTCNoon(monthKey);

  return NextResponse.json({
    scopeId,
    month: monthKey,
    includePreviousMonth,
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
  });
}
