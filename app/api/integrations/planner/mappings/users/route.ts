import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';

export async function POST(request: NextRequest) {
  let access: Awaited<ReturnType<typeof requirePlannerIntegrationAccess>>;
  try {
    access = await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  let body: {
    id?: string;
    boutiqueId?: string | null;
    microsoftUserId?: string | null;
    microsoftEmail?: string | null;
    microsoftDisplayName?: string | null;
    employeeId: string;
    active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.employeeId || typeof body.employeeId !== 'string') {
    return NextResponse.json({ error: 'employeeId required' }, { status: 400 });
  }

  const emp = await prisma.employee.findUnique({
    where: { empId: body.employeeId },
    select: { empId: true, boutiqueId: true },
  });
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  if (access.boutiqueId && emp.boutiqueId !== access.boutiqueId) {
    return NextResponse.json({ error: 'Forbidden: employee not in your boutique' }, { status: 403 });
  }

  const data = {
    boutiqueId: access.boutiqueId ?? body.boutiqueId ?? null,
    microsoftUserId: body.microsoftUserId ?? null,
    microsoftEmail: body.microsoftEmail ?? null,
    microsoftDisplayName: body.microsoftDisplayName ?? null,
    employeeId: body.employeeId,
    active: body.active !== false,
  };

  if (body.id) {
    const existing = await prisma.plannerUserMap.findUnique({
      where: { id: body.id },
      select: { boutiqueId: true },
    });
    if (access.boutiqueId && existing && existing.boutiqueId !== access.boutiqueId) {
      return NextResponse.json({ error: 'Forbidden: boutique scope' }, { status: 403 });
    }
    const updated = await prisma.plannerUserMap.update({
      where: { id: body.id },
      data,
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.plannerUserMap.create({ data });
  return NextResponse.json(created);
}
