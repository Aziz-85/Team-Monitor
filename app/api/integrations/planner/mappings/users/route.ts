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

  if (access.role === 'AREA_MANAGER' && (!access.boutiqueIds || access.boutiqueIds.length === 0)) {
    return NextResponse.json({ error: 'Forbidden: no boutique scope' }, { status: 403 });
  }

  if (!body.employeeId || typeof body.employeeId !== 'string') {
    return NextResponse.json({ error: 'employeeId required' }, { status: 400 });
  }

  const emp = await prisma.employee.findUnique({
    where: { empId: body.employeeId },
    select: { empId: true, boutiqueId: true },
  });
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const canAccessBoutique = (boutiqueId: string | null) => {
    if (!boutiqueId) return true;
    if (access.boutiqueId) return boutiqueId === access.boutiqueId;
    if (access.boutiqueIds?.length) return access.boutiqueIds.includes(boutiqueId);
    return true; // SUPER_ADMIN
  };
  if ((access.boutiqueId || access.boutiqueIds?.length) && emp.boutiqueId && !canAccessBoutique(emp.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden: employee not in your boutique' }, { status: 403 });
  }

  const effectiveBoutiqueId = access.boutiqueId ?? (body.boutiqueId && canAccessBoutique(body.boutiqueId) ? body.boutiqueId : null) ?? emp.boutiqueId ?? body.boutiqueId ?? null;
  const data = {
    boutiqueId: effectiveBoutiqueId,
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
    if ((access.boutiqueId || access.boutiqueIds?.length) && existing?.boutiqueId && !canAccessBoutique(existing.boutiqueId)) {
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
