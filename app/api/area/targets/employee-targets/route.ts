/**
 * GET /api/area/targets/employee-targets — List employee targets for a boutique+month. AREA_MANAGER / SUPER_ADMIN only.
 * Query: month=YYYY-MM, boutiqueId= (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';
import { parseMonthKey, normalizeMonthKey } from '@/lib/time';

export async function GET(request: NextRequest) {
  try {
    await assertAreaManagerOrSuperAdmin();
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const monthParam = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const monthKey = normalizeMonthKey(monthParam);
  if (!parseMonthKey(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }

  const targets = await prisma.employeeMonthlyTarget.findMany({
    where: { boutiqueId, month: monthKey },
    select: { userId: true, amount: true, user: { select: { empId: true, employee: { select: { name: true } } } } },
  });

  const employeesInBoutique = await prisma.employee.findMany({
    where: { boutiqueId, active: true, isSystemOnly: false },
    select: { empId: true, name: true, user: { select: { id: true } } },
  });

  const targetByUserId = new Map(targets.map((t) => [t.userId, t.amount]));
  const list = employeesInBoutique.map((e) => ({
    empId: e.empId,
    name: e.name,
    userId: e.user?.id ?? null,
    amount: e.user?.id ? targetByUserId.get(e.user.id) ?? null : null,
  }));

  return NextResponse.json({ month: monthKey, boutiqueId, items: list });
}
