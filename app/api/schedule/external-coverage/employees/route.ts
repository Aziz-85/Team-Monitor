/**
 * GET /api/schedule/external-coverage/employees?sourceBoutiqueId=...
 * External Coverage dropdown only: ALL active employees from the selected source boutique.
 * Requires operational boutique scope; sourceBoutiqueId must be provided and must NOT be the host.
 * RBAC: ADMIN | MANAGER | ASSISTANT_MANAGER.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { prisma } from '@/lib/db';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) {
    return scopeResult.res;
  }
  const { boutiqueId: hostBoutiqueId } = scopeResult;

  const sourceBoutiqueId = request.nextUrl.searchParams.get('sourceBoutiqueId')?.trim() ?? '';
  if (!sourceBoutiqueId) {
    return NextResponse.json({ error: 'sourceBoutiqueId is required' }, { status: 400 });
  }
  if (sourceBoutiqueId === hostBoutiqueId) {
    return NextResponse.json({ error: 'Source boutique must be different from host boutique' }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({
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
      boutique: { select: { name: true, code: true } },
    },
    orderBy: [{ empId: 'asc' }, { name: 'asc' }],
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
