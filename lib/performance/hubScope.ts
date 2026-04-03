/**
 * Performance Hub — RBAC + boutique / region scope (server-trusted only).
 * - MANAGER / ADMIN: single operational boutique; no comparison.
 * - AREA_MANAGER: all membership boutiques; boutique comparison within scope only.
 * - SUPER_ADMIN: all active boutiques; boutique + region comparison.
 * - DEMO_VIEWER / EMPLOYEE / ASSISTANT_MANAGER: no access (enforced at API + route).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

export type PerformanceHubCompareMode = 'none' | 'boutiques' | 'regions';

export type PerformanceHubScopeRow = {
  id: string;
  code: string;
  name: string;
  regionId: string | null;
};

export type PerformanceHubContext = {
  userId: string;
  role: Role;
  allowedBoutiqueIds: string[];
  boutiques: PerformanceHubScopeRow[];
  regions: { id: string; name: string; code: string | null }[];
  canCompareBoutiques: boolean;
  canCompareRegions: boolean;
  defaultBoutiqueIds: string[];
};

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export async function resolvePerformanceHubContext(
  request: NextRequest | null
): Promise<{ ctx: PerformanceHubContext; res: null } | { ctx: null; res: NextResponse }> {
  const user = await getSessionUser();
  if (!user?.id) {
    return { ctx: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = user.role as Role;
  if (role === 'DEMO_VIEWER' || role === 'EMPLOYEE' || role === 'ASSISTANT_MANAGER') {
    return { ctx: null, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return { ctx: null, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  let allowedBoutiqueIds: string[];
  if (role === 'SUPER_ADMIN') {
    const all = await prisma.boutique.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, regionId: true },
      orderBy: { code: 'asc' },
    });
    allowedBoutiqueIds = all.map((b) => b.id);
    const regionIdsFromBoutiques = Array.from(
      new Set(all.map((b) => b.regionId).filter((x): x is string => Boolean(x)))
    );
    const regions =
      regionIdsFromBoutiques.length > 0
        ? await prisma.region.findMany({
            where: { id: { in: regionIdsFromBoutiques } },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
          })
        : [];
    const op = request ? await getOperationalScope(request) : await getOperationalScope();
    const defaultIds =
      op?.boutiqueId && allowedBoutiqueIds.includes(op.boutiqueId) ? [op.boutiqueId] : allowedBoutiqueIds.slice(0, 1);
    return {
      ctx: {
        userId: user.id,
        role,
        allowedBoutiqueIds,
        boutiques: all,
        regions,
        canCompareBoutiques: true,
        canCompareRegions: true,
        defaultBoutiqueIds: defaultIds.filter(Boolean),
      },
      res: null,
    };
  }

  if (role === 'AREA_MANAGER') {
    const allowedIds = await getUserAllowedBoutiqueIds(user.id);
    if (allowedIds.length === 0) {
      return { ctx: null, res: NextResponse.json({ error: 'No boutique scope' }, { status: 403 }) };
    }
    const boutiques = await prisma.boutique.findMany({
      where: { id: { in: allowedIds }, isActive: true },
      select: { id: true, code: true, name: true, regionId: true },
      orderBy: { code: 'asc' },
    });
    const regionIds = Array.from(
      new Set(boutiques.map((b) => b.regionId).filter((x): x is string => Boolean(x)))
    );
    const regions =
      regionIds.length > 0
        ? await prisma.region.findMany({
            where: { id: { in: regionIds } },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
          })
        : [];
    const op = request ? await getOperationalScope(request) : await getOperationalScope();
    const primary = op?.boutiqueId && allowedIds.includes(op.boutiqueId) ? op.boutiqueId : allowedIds[0];
    return {
      ctx: {
        userId: user.id,
        role,
        allowedBoutiqueIds: allowedIds,
        boutiques,
        regions,
        canCompareBoutiques: allowedIds.length > 1,
        canCompareRegions: false,
        defaultBoutiqueIds: primary ? [primary] : [],
      },
      res: null,
    };
  }

  /* MANAGER / ADMIN — single boutique */
  const op = request ? await getOperationalScope(request) : await getOperationalScope();
  const bid = op?.boutiqueId ?? user.boutiqueId ?? '';
  if (!bid) {
    return { ctx: null, res: NextResponse.json({ error: 'No boutique scope' }, { status: 403 }) };
  }
  const row = await prisma.boutique.findUnique({
    where: { id: bid },
    select: { id: true, code: true, name: true, regionId: true, isActive: true },
  });
  if (!row?.isActive) {
    return { ctx: null, res: NextResponse.json({ error: 'Boutique not available' }, { status: 403 }) };
  }
  return {
    ctx: {
      userId: user.id,
      role,
      allowedBoutiqueIds: [bid],
      boutiques: [row],
      regions: [],
      canCompareBoutiques: false,
      canCompareRegions: false,
      defaultBoutiqueIds: [bid],
    },
    res: null,
  };
}

export function normalizeCompareMode(
  raw: string | null,
  ctx: PerformanceHubContext
): PerformanceHubCompareMode {
  const v = (raw ?? 'none').toLowerCase();
  if (v === 'regions' && ctx.canCompareRegions) return 'regions';
  if (v === 'boutiques' && ctx.canCompareBoutiques) return 'boutiques';
  return 'none';
}
