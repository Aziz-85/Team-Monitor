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
    integrationId: string;
    externalBucketId: string;
    externalBucketName: string;
    localTaskType?: string | null;
    localZone?: string | null;
    localPriority?: number | null;
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

  if (!body.integrationId || !body.externalBucketId || !body.externalBucketName) {
    return NextResponse.json({ error: 'integrationId, externalBucketId, externalBucketName required' }, { status: 400 });
  }

  const integration = await prisma.plannerIntegration.findUnique({
    where: { id: body.integrationId },
    select: { boutiqueId: true },
  });
  if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  const canAccessBoutique = (boutiqueId: string | null) => {
    if (!boutiqueId) return true;
    if (access.boutiqueId) return boutiqueId === access.boutiqueId;
    if (access.boutiqueIds?.length) return access.boutiqueIds.includes(boutiqueId);
    return true; // SUPER_ADMIN
  };
  if (integration.boutiqueId && !canAccessBoutique(integration.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden: integration not in your boutique' }, { status: 403 });
  }

  const data = {
    integrationId: body.integrationId,
    externalBucketId: body.externalBucketId,
    externalBucketName: body.externalBucketName,
    localTaskType: body.localTaskType ?? null,
    localZone: body.localZone ?? null,
    localPriority: body.localPriority ?? null,
    active: body.active !== false,
  };

  if (body.id) {
    const existing = await prisma.plannerBucketMap.findUnique({
      where: { id: body.id },
      include: { integration: { select: { boutiqueId: true } } },
    });
    if (existing?.integration.boutiqueId && !canAccessBoutique(existing.integration.boutiqueId)) {
      return NextResponse.json({ error: 'Forbidden: boutique scope' }, { status: 403 });
    }
    const updated = await prisma.plannerBucketMap.update({
      where: { id: body.id },
      data,
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.plannerBucketMap.create({
    data: {
      integrationId: body.integrationId,
      externalBucketId: body.externalBucketId,
      externalBucketName: body.externalBucketName,
      localTaskType: body.localTaskType ?? null,
      localZone: body.localZone ?? null,
      localPriority: body.localPriority ?? null,
    },
  });
  return NextResponse.json(created);
}
