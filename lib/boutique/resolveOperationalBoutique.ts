/**
 * OPERATIONAL BOUTIQUE RESOLVER — Single boutique for operational pages only
 * -------------------------------------------------------------------------
 * Operational pages (schedule, tasks, inventory, leaves, sales/daily) MUST use
 * exactly ONE boutiqueId. No REGION/GROUP/SELECTION. Employee.boutiqueId is the
 * single source of truth for roster membership.
 */

import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export type ResolveOperationalBoutiqueResult = {
  boutiqueId: string;
  label: string;
};

const CAN_SELECT_OPERATIONAL_BOUTIQUE: Role[] = ['ADMIN', 'MANAGER'];

async function getDefaultBoutiqueId(): Promise<string | null> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'DEFAULT_BOUTIQUE_ID' },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return null;
  try {
    const id = JSON.parse(row.valueJson) as string;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** Boutique IDs the user can operate in (from UserBoutiqueMembership, canAccess). */
async function getUserAllowedBoutiqueIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userBoutiqueMembership.findMany({
    where: { userId, canAccess: true },
    include: { boutique: { select: { id: true, isActive: true } } },
  });
  return memberships.filter((m) => m.boutique.isActive).map((m) => m.boutiqueId);
}

/** Get Employee.boutiqueId for a user (via User.empId). Use for sales write-path validation. */
export async function getEmployeeBoutiqueIdForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { empId: true },
  });
  if (!user?.empId) return null;
  const emp = await prisma.employee.findUnique({
    where: { empId: user.empId },
    select: { boutiqueId: true },
  });
  return emp?.boutiqueId ?? null;
}

/** Primary operational boutique for ASSISTANT_MANAGER/EMPLOYEE: their Employee.boutiqueId. */
async function getEmployeeBoutiqueId(userId: string): Promise<string | null> {
  return getEmployeeBoutiqueIdForUser(userId);
}

async function buildLabel(boutiqueId: string): Promise<string> {
  const b = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { name: true, code: true },
  });
  return b ? `${b.name} (${b.code})` : boutiqueId;
}

/**
 * Resolve operational boutiqueId for a user.
 * - ADMIN/MANAGER: use requestedBoutiqueId if allowed; else stored preference; else first membership; else default.
 * - ASSISTANT_MANAGER/EMPLOYEE: force to their Employee.boutiqueId; else first membership; else default.
 * Never returns REGION/GROUP. Always single BOUTIQUE.
 */
export async function resolveOperationalBoutiqueId(
  userId: string,
  role: Role,
  requestedBoutiqueId?: string | null
): Promise<ResolveOperationalBoutiqueResult> {
  const allowedIds = await getUserAllowedBoutiqueIds(userId);
  const defaultId = await getDefaultBoutiqueId();

  const fallbackId =
    defaultId && allowedIds.includes(defaultId)
      ? defaultId
      : allowedIds[0] ?? defaultId ?? '';

  if (!CAN_SELECT_OPERATIONAL_BOUTIQUE.includes(role)) {
    const empBoutique = await getEmployeeBoutiqueId(userId);
    const boutiqueId =
      empBoutique && allowedIds.includes(empBoutique)
        ? empBoutique
        : fallbackId;
    const label = boutiqueId ? await buildLabel(boutiqueId) : '—';
    return { boutiqueId: boutiqueId || fallbackId, label };
  }

  let candidateId: string | null = null;
  if (requestedBoutiqueId && allowedIds.includes(requestedBoutiqueId)) {
    candidateId = requestedBoutiqueId;
  }
  if (!candidateId) {
    try {
      const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { operationalBoutiqueId: true },
      });
      if (pref?.operationalBoutiqueId && allowedIds.includes(pref.operationalBoutiqueId)) {
        candidateId = pref.operationalBoutiqueId;
      }
    } catch {
      // operationalBoutiqueId column may not exist if migration not yet applied; use fallback
    }
  }
  const boutiqueId = candidateId ?? fallbackId;
  const label = boutiqueId ? await buildLabel(boutiqueId) : '—';
  return { boutiqueId, label };
}
