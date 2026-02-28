/**
 * GET /api/sales/import/export?month=YYYY-MM&includePreviousMonth=true|false
 * Export sales from DB to xlsx in DATA_MATRIX format (same as template).
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] as const;
const SHEET_NAME = 'DATA_MATRIX';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function previousMonthKey(monthKey: string): string | null {
  const [y, m] = monthKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const scopeId = scopeResult.boutiqueId;

  const monthParam = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const includePreviousMonth = request.nextUrl.searchParams.get('includePreviousMonth')?.toLowerCase() === 'true';

  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  const [year, monthNum] = monthParam.split('-').map(Number);
  let rangeStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const rangeEnd = new Date(Date.UTC(year, monthNum, 0));
  if (includePreviousMonth) {
    const prev = previousMonthKey(monthParam);
    if (prev) {
      const [py, pm] = prev.split('-').map(Number);
      rangeStart = new Date(Date.UTC(py, pm - 1, 1));
    }
  }

  const employees = await prisma.employee.findMany({
    where: { boutiqueId: scopeId, active: true },
    select: { empId: true, name: true },
    orderBy: [{ name: 'asc' }, { empId: 'asc' }],
  });

  const summaries = await prisma.boutiqueSalesSummary.findMany({
    where: { boutiqueId: scopeId, date: { gte: rangeStart, lte: rangeEnd } },
    include: { lines: true },
  });

  const dateToLines = new Map<string, { employeeId: string; amountSar: number }[]>();
  for (const s of summaries) {
    const dateKey = s.date.toISOString().slice(0, 10);
    dateToLines.set(dateKey, s.lines.map((l) => ({ employeeId: l.employeeId, amountSar: l.amountSar })));
  }

  const headerRow: (string | number)[] = ['ScopeId', 'Date', 'Day'];
  for (const e of employees) {
    headerRow.push(`${(e.empId ?? '').trim()} - ${(e.name ?? e.empId ?? '').trim()}`);
  }
  headerRow.push('TOTAL');

  const aoa: (string | number)[][] = [headerRow];

  for (let d = new Date(rangeStart.getTime()); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateKey = d.toISOString().slice(0, 10);
    const dayName = DAY_NAMES[d.getUTCDay()];
    const lineMap = new Map((dateToLines.get(dateKey) ?? []).map((l) => [l.employeeId, l.amountSar]));
    const row: (string | number)[] = [scopeId, dateKey, dayName];
    for (const e of employees) {
      const val = lineMap.get(e.empId);
      row.push(val ?? '');
    }
    row.push('');
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Sales_Matrix_Export_${monthParam}.xlsx"`,
    },
  });
}
