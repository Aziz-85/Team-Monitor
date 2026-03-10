import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let access: Awaited<ReturnType<typeof requirePlannerIntegrationAccess>>;
  try {
    access = await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  if (access.role === 'AREA_MANAGER' && (!access.boutiqueIds || access.boutiqueIds.length === 0)) {
    return NextResponse.json({ error: 'Forbidden: no boutique scope' }, { status: 403 });
  }

  const existing = await prisma.plannerUserMap.findUnique({
    where: { id },
    select: { boutiqueId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'User map not found' }, { status: 404 });
  }

  const canAccessBoutique = (boutiqueId: string | null) => {
    if (!boutiqueId) return true;
    if (access.boutiqueId) return boutiqueId === access.boutiqueId;
    if (access.boutiqueIds?.length) return access.boutiqueIds.includes(boutiqueId);
    return true; // SUPER_ADMIN
  };
  if ((access.boutiqueId || access.boutiqueIds?.length) && existing.boutiqueId && !canAccessBoutique(existing.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden: boutique scope' }, { status: 403 });
  }

  await prisma.plannerUserMap.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
