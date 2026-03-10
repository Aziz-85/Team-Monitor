import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';
import { filterOperationalEmployees } from '@/lib/systemUsers';

/**
 * GET /api/integrations/planner/employees
 * Returns employees with empId, name, email for the Planner integration scope.
 * Uses same auth as Planner page (ADMIN, SUPER_ADMIN, AREA_MANAGER).
 * Includes email for auto-fill in Add user map modal.
 */
export async function GET() {
  let access: Awaited<ReturnType<typeof requirePlannerIntegrationAccess>>;
  try {
    access = await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  const boutiqueFilter = access.boutiqueId
    ? { boutiqueId: access.boutiqueId }
    : access.boutiqueIds?.length
      ? { boutiqueId: { in: access.boutiqueIds } }
      : null;

  // AREA_MANAGER with no boutiqueIds = no scope; return empty (no cross-boutique leakage)
  if (access.role === 'AREA_MANAGER' && (!access.boutiqueIds || access.boutiqueIds.length === 0)) {
    return NextResponse.json([]);
  }

  const where = {
    isSystemOnly: false,
    active: true,
    ...(boutiqueFilter ?? {}),
  };

  const employeesRaw = await prisma.employee.findMany({
    where,
    select: { empId: true, name: true, email: true, isSystemOnly: true },
    orderBy: { empId: 'asc' },
  });

  const employees = filterOperationalEmployees(employeesRaw);

  return NextResponse.json(
    employees.map((e) => ({
      empId: e.empId,
      name: e.name,
      email: e.email ?? null,
    }))
  );
}
