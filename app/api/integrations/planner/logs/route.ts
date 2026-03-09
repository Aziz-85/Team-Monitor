import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';

export async function GET(request: NextRequest) {
  let access: Awaited<ReturnType<typeof requirePlannerIntegrationAccess>>;
  try {
    access = await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)));
  const status = request.nextUrl.searchParams.get('status');
  const mode = request.nextUrl.searchParams.get('mode');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (mode) where.mode = mode;
  if (access.boutiqueId) {
    where.integration = { boutiqueId: access.boutiqueId };
  }

  const [logs, total] = await Promise.all([
    prisma.plannerSyncLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        integrationId: true,
        direction: true,
        mode: true,
        eventType: true,
        status: true,
        relatedLocalTaskId: true,
        relatedExternalTaskId: true,
        message: true,
        requestPayload: true,
        responsePayload: true,
        createdAt: true,
      },
    }),
    prisma.plannerSyncLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
