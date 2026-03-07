/**
 * GET /api/area/employees — Global employee list for AREA_MANAGER / SUPER_ADMIN.
 * Query: q=, status=active|all, boutiqueId= (optional filter).
 * Returns safe fields only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { filterOperationalEmployees } from '@/lib/systemUsers';

const SAFE_SELECT = {
  empId: true,
  name: true,
  email: true,
  phone: true,
  team: true,
  position: true,
  active: true,
  boutiqueId: true,
  isSystemOnly: true,
  boutique: { select: { id: true, code: true, name: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    await assertAreaManagerOrSuperAdmin();
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const status = searchParams.get('status') === 'all' ? 'all' : 'active';
  const boutiqueId = searchParams.get('boutiqueId')?.trim() ?? undefined;

  const boutiqueIds = boutiqueId ? [boutiqueId] : [];
  const where: Prisma.EmployeeWhereInput = {
    ...buildEmployeeWhereForOperational(boutiqueIds, { q: q || undefined, excludeSystemOnly: true }),
    ...(status === 'active' ? { active: true } : {}),
  };

  const employeesRaw = await prisma.employee.findMany({
    where,
    select: SAFE_SELECT,
    orderBy: employeeOrderByStable,
  });
  const employees = filterOperationalEmployees(employeesRaw);

  return NextResponse.json(employees);
}
