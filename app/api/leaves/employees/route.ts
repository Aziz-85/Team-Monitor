import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getOperationalEmployeesSelect } from '@/lib/employees/getOperationalEmployees';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'ASSISTANT_MANAGER'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueId) return NextResponse.json([]);

  const employees = await getOperationalEmployeesSelect(scope.boutiqueId);
  return NextResponse.json(employees.map((e) => ({ empId: e.empId, name: e.name })));
}
