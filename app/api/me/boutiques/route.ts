/**
 * GET /api/me/boutiques — list accessible boutiques + regions.
 * Include groups only for ADMIN/MANAGER.
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

const FULL_SCOPE_ROLES: Role[] = ['ADMIN', 'MANAGER'];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await prisma.userBoutiqueMembership.findMany({
    where: { userId: user.id, canAccess: true },
    include: {
      boutique: {
        select: { id: true, code: true, name: true, regionId: true, isActive: true },
      },
    },
  });

  // Only active boutiques in scope selector (non-admin flow)
  const activeMemberships = memberships.filter((m) => m.boutique.isActive);
  const boutiqueIds = activeMemberships.map((m) => m.boutiqueId);
  const boutiques = activeMemberships.map((m) => ({
    id: m.boutique.id,
    code: m.boutique.code,
    name: m.boutique.name,
    regionId: m.boutique.regionId,
  }));

  const regionIds = Array.from(new Set(boutiques.map((b) => b.regionId).filter(Boolean))) as string[];
  const regions =
    regionIds.length > 0
      ? await prisma.region.findMany({
          where: { id: { in: regionIds } },
          select: { id: true, code: true, name: true },
        })
      : [];

  let groups: { id: string; name: string; boutiqueIds: string[] }[] = [];
  if (FULL_SCOPE_ROLES.includes(user.role as Role)) {
    const allGroups = await prisma.boutiqueGroup.findMany({
      where: { isActive: true },
      include: {
        members: {
          where: { boutiqueId: { in: boutiqueIds } },
          select: { boutiqueId: true },
        },
      },
    });
    groups = allGroups
      .filter((g) => g.members.some((m) => boutiqueIds.includes(m.boutiqueId)))
      .map((g) => ({
        id: g.id,
        name: g.name,
        boutiqueIds: g.members.map((m) => m.boutiqueId),
      }));
  }

  return NextResponse.json({
    boutiques,
    regions,
    groups,
    canSelectRegionGroup: FULL_SCOPE_ROLES.includes(user.role as Role),
  });
}
