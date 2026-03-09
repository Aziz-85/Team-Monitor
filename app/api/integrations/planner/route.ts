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

  const where = access.boutiqueId ? { boutiqueId: access.boutiqueId } : {};
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

  if (access.boutiqueId) {
    const requestedBoutique = body.boutiqueId ?? null;
    if (requestedBoutique && requestedBoutique !== access.boutiqueId) {
      return NextResponse.json({ error: 'Forbidden: boutique scope' }, { status: 403 });
    }
    if (body.id) {
      const existing = await prisma.plannerIntegration.findUnique({
        where: { id: body.id },
        select: { boutiqueId: true },
      });
      if (existing && existing.boutiqueId !== access.boutiqueId) {
        return NextResponse.json({ error: 'Forbidden: boutique scope' }, { status: 403 });
      }
    }
  }

  const mode: PlannerIntegrationMode =
    body.mode === 'GRAPH_DIRECT' || body.mode === 'POWER_AUTOMATE' ? body.mode : 'MANUAL';
  const syncDirection: PlannerSyncDirection =
    body.syncDirection === 'EXPORT_ONLY' || body.syncDirection === 'TWO_WAY' ? body.syncDirection : 'IMPORT_ONLY';

  const data = {
    boutiqueId: access.boutiqueId ?? body.boutiqueId ?? null,
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
