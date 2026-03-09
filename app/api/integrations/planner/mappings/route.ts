import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';

export async function GET() {
  let access: Awaited<ReturnType<typeof requirePlannerIntegrationAccess>>;
  try {
    access = await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  const userWhere = access.boutiqueId ? { active: true, boutiqueId: access.boutiqueId } : { active: true };
  const bucketWhere = access.boutiqueId
    ? { active: true, integration: { boutiqueId: access.boutiqueId } }
    : { active: true };

  const [userMaps, bucketMaps] = await Promise.all([
    prisma.plannerUserMap.findMany({
      where: userWhere,
      include: { employee: { select: { empId: true, name: true, boutiqueId: true } } },
    }),
    prisma.plannerBucketMap.findMany({
      where: bucketWhere,
      include: { integration: { select: { id: true, planName: true } } },
    }),
  ]);

  return NextResponse.json({
    userMaps,
    bucketMaps,
    userCount: userMaps.length,
    bucketCount: bucketMaps.length,
  });
}
