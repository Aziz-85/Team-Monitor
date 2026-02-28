/**
 * GET /api/sales/import/template?month=YYYY-MM
 * Generate DATA_MATRIX xlsx template for the selected month.
 * Auth: ADMIN, MANAGER, ASSISTANT_MANAGER. Scope: operational boutique.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] as const;
const SHEET_NAME = 'DATA_MATRIX';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  const [year, monthNum] = monthParam.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));
  const daysInMonth = monthEnd.getUTCDate();

  const employees = await prisma.employee.findMany({
    where: { boutiqueId: scopeId, active: true },
    select: { empId: true, name: true },
    orderBy: [{ name: 'asc' }, { empId: 'asc' }],
  });

  const headerRow: (string | number)[] = ['ScopeId', 'Date', 'Day'];
  for (const e of employees) {
    headerRow.push(`${(e.empId ?? '').trim()} - ${(e.name ?? e.empId ?? '').trim()}`);
  }
  headerRow.push('TOTAL');

  const aoa: (string | number)[][] = [headerRow];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, monthNum - 1, day));
    const dateKey = date.toISOString().slice(0, 10);
    const dayName = DAY_NAMES[date.getUTCDay()];
    const row: (string | number)[] = [scopeId, dateKey, dayName];
    for (let i = 0; i < employees.length; i++) {
      row.push('');
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
      'Content-Disposition': `attachment; filename="Matrix_Template_${monthParam}.xlsx"`,
    },
  });
}
