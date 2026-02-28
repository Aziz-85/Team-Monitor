import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import { employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import type { Role } from '@prisma/client';

/**
 * GET /api/schedule/guest-employees
 * Returns employees from OTHER boutiques only (for "Add External Coverage").
 * When in AlRashid → Dhahran (and any other branch); when in Dhahran → AlRashid (and any other).
 */
export async function GET(request: NextRequest) {
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

  // موظفين من كل الفروع الأخرى (غير الفرع الحالي) — لا نعتمد على العضوية
  const employees = await prisma.employee.findMany({
    where: {
      active: true,
      isSystemOnly: false,
      boutiqueId: { notIn: scope.boutiqueIds },
      ...notDisabledUserWhere,
    },
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
