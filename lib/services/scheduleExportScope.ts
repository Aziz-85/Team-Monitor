/**
 * Boutique scope resolution for schedule export (server-side only).
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

export type ScheduleExportBoutiqueOption = {
  id: string;
  code: string;
  name: string;
  label: string;
};

export async function getScheduleExportAllowedBoutiqueIds(user: SessionUser): Promise<string[]> {
  const fromMembership = await getUserAllowedBoutiqueIds(user.id);
  if (fromMembership.length > 0) return fromMembership;
  if (user.boutiqueId) return [user.boutiqueId];
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    const all = await prisma.boutique.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    return all.map((b) => b.id);
  }
  return [];
}

export async function getScheduleExportBoutiqueOptions(
  user: SessionUser
): Promise<ScheduleExportBoutiqueOption[]> {
  const ids = await getScheduleExportAllowedBoutiqueIds(user);
  if (ids.length === 0) return [];
  const rows = await prisma.boutique.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });
  return rows.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    label: `${b.name} (${b.code})`,
  }));
}

export type ResolvedScheduleExportBoutiques = {
  boutiqueIds: string[];
  labelsById: Map<string, string>;
  canSelectAll: boolean;
};

/**
 * Resolve boutique IDs for export. boutiqueIdParam:
 * - omitted / "current" → session schedule scope boutique
 * - "all" → all allowed boutiques (requires canSelectAll)
 * - specific id → must be in allowed set
 */
export async function resolveScheduleExportBoutiques(
  user: SessionUser,
  request: NextRequest | null,
  boutiqueIdParam: string | null | undefined
): Promise<ResolvedScheduleExportBoutiques | { error: string }> {
  const allowedIds = await getScheduleExportAllowedBoutiqueIds(user);
  const options = await getScheduleExportBoutiqueOptions(user);
  const labelsById = new Map(options.map((o) => [o.id, o.label]));
  const canSelectAll = allowedIds.length > 1;

  const param = boutiqueIdParam?.trim() ?? '';
  const wantsAll = param === 'all' || param === '__all__';

  if (wantsAll) {
    if (!canSelectAll) {
      return { error: 'Multi-boutique export is not available for your account.' };
    }
    return { boutiqueIds: allowedIds, labelsById, canSelectAll };
  }

  if (param && param !== 'current') {
    if (!allowedIds.includes(param)) {
      return { error: 'Boutique not in your allowed scope.' };
    }
    return { boutiqueIds: [param], labelsById, canSelectAll };
  }

  const scheduleScope = await getScheduleScope(request ?? undefined);
  const defaultId = scheduleScope?.boutiqueId ?? user.boutiqueId ?? allowedIds[0] ?? '';
  if (!defaultId) {
    return { error: 'Select a boutique in the scope selector.' };
  }
  if (!allowedIds.includes(defaultId) && allowedIds.length > 0) {
    return { error: 'Boutique not in your allowed scope.' };
  }
  return { boutiqueIds: [defaultId], labelsById, canSelectAll };
}

export const SCHEDULE_EXPORT_ROLES: Role[] = [
  'MANAGER',
  'ASSISTANT_MANAGER',
  'ADMIN',
  'EMPLOYEE',
  'SUPER_ADMIN',
  'AREA_MANAGER',
];
