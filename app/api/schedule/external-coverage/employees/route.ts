/**
 * GET /api/schedule/external-coverage/employees?sourceBoutiqueId=...
 * External Coverage dropdown: active operational employees from the selected source boutique.
 * Requires schedule scope; sourceBoutiqueId must differ from host boutique.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireScheduleScope } from '@/lib/scope/scheduleScope';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { prisma } from '@/lib/db';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireScheduleScope(request);
  if (scopeResult.res) {
    return scopeResult.res;
  }
  const hostBoutiqueId = scopeResult.scope.boutiqueId;

  const sourceBoutiqueId = request.nextUrl.searchParams.get('sourceBoutiqueId')?.trim() ?? '';
  if (!sourceBoutiqueId) {
    return NextResponse.json({ error: 'sourceBoutiqueId is required' }, { status: 400 });
  }
  if (sourceBoutiqueId === hostBoutiqueId) {
    return NextResponse.json({ error: 'Source boutique must be different from host boutique' }, { status: 400 });
  }

  const sourceBoutique = await prisma.boutique.findFirst({
    where: { id: sourceBoutiqueId, isActive: true },
    select: { id: true, name: true, code: true },
  });
  if (!sourceBoutique) {
    return NextResponse.json({ error: 'Source boutique not found or inactive' }, { status: 404 });
  }

  const employeesRaw = await prisma.employee.findMany({
    where: {
      active: true,
      isSystemOnly: false,
      boutiqueId: sourceBoutiqueId,
      ...notDisabledUserWhere,
    },
    select: {
      empId: true,
      name: true,
      boutiqueId: true,
      isSystemOnly: true,
      boutique: { select: { name: true, code: true } },
    },
    orderBy: [{ empId: 'asc' }, { name: 'asc' }],
  });
  const employees = filterOperationalEmployees(employeesRaw);

  return NextResponse.json({
    employees: employees.map((e) => ({
      empId: e.empId,
      name: e.name,
      boutiqueId: e.boutiqueId,
      boutiqueName: e.boutique?.name ?? sourceBoutique.name,
      boutiqueCode: e.boutique?.code ?? sourceBoutique.code,
    })),
  });
}
