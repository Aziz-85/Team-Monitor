import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';
import { isGraphConfigured } from '@/lib/integrations/planner/graphClient';
import type { PlannerIntegrationMode, PlannerSyncDirection } from '@/lib/integrations/planner/types';

export async function GET() {
  let access: Awaited<ReturnType<typeof requirePlannerIntegrationAccess>>;
  try {
    access = await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  const where = access.boutiqueId
    ? { boutiqueId: access.boutiqueId }
    : access.boutiqueIds?.length
      ? { boutiqueId: { in: access.boutiqueIds } }
      : {};
  const [integrations, graphOk] = await Promise.all([
    prisma.plannerIntegration.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        boutiqueId: true,
        mode: true,
        enabled: true,
        syncDirection: true,
        planName: true,
        planExternalId: true,
        graphConnectionStatus: true,
        lastSyncAt: true,
        lastSuccessfulSyncAt: true,
        lastErrorAt: true,
        lastErrorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    Promise.resolve(isGraphConfigured()),
  ]);

  return NextResponse.json({
    integrations,
    graphConfigured: graphOk,
  });
}

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
    mode?: string;
    enabled?: boolean;
    syncDirection?: string;
    planExternalId?: string | null;
    planName?: string | null;
    webhookSecret?: string | null;
    tenantId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const canAccessBoutique = (boutiqueId: string | null) =>
    !boutiqueId ||
    (access.boutiqueId ? boutiqueId === access.boutiqueId : access.boutiqueIds?.includes(boutiqueId) ?? true);

  if (access.boutiqueId || access.boutiqueIds?.length) {
    const requestedBoutique = body.boutiqueId ?? null;
    if (requestedBoutique && !canAccessBoutique(requestedBoutique)) {
      return NextResponse.json({ error: 'Forbidden: boutique scope' }, { status: 403 });
    }
    if (body.id) {
      const existing = await prisma.plannerIntegration.findUnique({
        where: { id: body.id },
        select: { boutiqueId: true },
      });
      if (existing?.boutiqueId && !canAccessBoutique(existing.boutiqueId)) {
        return NextResponse.json({ error: 'Forbidden: boutique scope' }, { status: 403 });
      }
    }
  }

  const mode: PlannerIntegrationMode =
    body.mode === 'GRAPH_DIRECT' || body.mode === 'POWER_AUTOMATE' ? body.mode : 'MANUAL';
  const syncDirection: PlannerSyncDirection =
    body.syncDirection === 'EXPORT_ONLY' || body.syncDirection === 'TWO_WAY' ? body.syncDirection : 'IMPORT_ONLY';

  const effectiveBoutiqueId =
    access.boutiqueId ?? (body.boutiqueId && canAccessBoutique(body.boutiqueId) ? body.boutiqueId : null) ?? body.boutiqueId ?? null;
  const data = {
    boutiqueId: effectiveBoutiqueId,
    mode,
    enabled: !!body.enabled,
    syncDirection,
    planExternalId: body.planExternalId ?? null,
    planName: body.planName ?? null,
    webhookSecret: body.webhookSecret ?? null,
    tenantId: body.tenantId ?? null,
  };

  if (body.id) {
    const updated = await prisma.plannerIntegration.update({
      where: { id: body.id },
      data: { ...data, updatedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.plannerIntegration.create({
    data: { ...data, provider: 'MICROSOFT_PLANNER' },
  });
  return NextResponse.json(created);
}
