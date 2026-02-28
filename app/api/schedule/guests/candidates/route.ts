/**
 * GET /api/schedule/guests/candidates?all=1
 * For "Add Guest Coverage" picker.
 * - Default: employees from other boutiques only (same as guest-employees).
 * - all=1 + ADMIN: all active employees (search across all boutiques).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import { employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getScheduleScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const allParam = request.nextUrl.searchParams.get('all');
  const allowAll = allParam === '1' && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

  const where = {
    active: true,
    isSystemOnly: false,
    ...notDisabledUserWhere,
    ...(allowAll ? {} : { boutiqueId: { notIn: scope.boutiqueIds } }),
  };

  const employees = await prisma.employee.findMany({
    where,
    select: {
      empId: true,
      name: true,
      boutiqueId: true,
      boutique: { select: { name: true, code: true } },
    },
    orderBy: employeeOrderByStable,
  });

  return NextResponse.json({
    employees: employees.map((e) => ({
      empId: e.empId,
      name: e.name,
      boutiqueId: e.boutiqueId,
      boutiqueName: e.boutique?.name ?? '',
      boutiqueCode: e.boutique?.code ?? '',
    })),
  });
}
