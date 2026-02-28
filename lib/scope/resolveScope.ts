/**
 * Tenant resolver — server-side only.
 * Resolves requested scope to allowed boutiqueIds by role and membership.
 * Policy: ASSISTANT_MANAGER/EMPLOYEE = BOUTIQUE only; ADMIN/MANAGER = BOUTIQUE, REGION, GROUP, SELECTION.
 */

import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';
import type { ScopeKind, ScopeSelectionJson, ResolvedScope } from './types';

const SCOPE_BOUTIQUE_ONLY: Role[] = ['ASSISTANT_MANAGER', 'EMPLOYEE'];
const SCOPE_FULL: Role[] = ['ADMIN', 'MANAGER'];

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

/** Returns boutique IDs the user is allowed to access (from UserBoutiqueMembership, canAccess + active boutique only). */
export async function getUserAllowedBoutiqueIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userBoutiqueMembership.findMany({
    where: { userId, canAccess: true },
    include: { boutique: { select: { id: true, isActive: true } } },
  });
  return memberships.filter((m) => m.boutique.isActive).map((m) => m.boutiqueId);
}

/** Resolve BOUTIQUE/REGION/GROUP/SELECTION to boutique IDs (no membership filter). */
async function resolveSelectionToBoutiqueIds(
  selection: ScopeSelectionJson
): Promise<string[]> {
  const { scope, boutiqueId, regionId, groupId, boutiqueIds } = selection;
  if (scope === 'BOUTIQUE' && boutiqueId) return [boutiqueId];
  if (scope === 'SELECTION' && boutiqueIds?.length) return [...boutiqueIds];
  if (scope === 'REGION' && regionId) {
    const boutiques = await prisma.boutique.findMany({
      where: { regionId, isActive: true },
      select: { id: true },
    });
    return boutiques.map((b) => b.id);
  }
  if (scope === 'GROUP' && groupId) {
    const members = await prisma.boutiqueGroupMember.findMany({
      where: { boutiqueGroupId: groupId, boutique: { isActive: true } },
      select: { boutiqueId: true },
    });
    return members.map((m) => m.boutiqueId);
  }
  return [];
}

/** Build label for resolved scope. */
async function buildLabel(
  scope: ScopeKind,
  boutiqueIds: string[]
): Promise<string> {
  if (boutiqueIds.length === 0) return '—';
  if (boutiqueIds.length === 1) {
    const b = await prisma.boutique.findUnique({
      where: { id: boutiqueIds[0] },
      select: { name: true, code: true },
    });
    return b ? `${b.name} (${b.code})` : boutiqueIds[0];
  }
  return `${boutiqueIds.length} boutiques`;
}

/**
 * Resolve scope for the user. Server-side only.
 * - ASSISTANT_MANAGER/EMPLOYEE: force BOUTIQUE (their first/only membership or default); ignore requested scope.
 * - ADMIN/MANAGER: allow requested scope but filter boutiqueIds to membership; if empty, fallback to default if allowed.
 */
export async function resolveScope(
  userId: string,
  userRole: Role,
  requestedScope?: ScopeSelectionJson | null
): Promise<ResolvedScope> {
  const allowedIds = await getUserAllowedBoutiqueIds(userId);
  const defaultId = await getDefaultBoutiqueId();

  if (SCOPE_BOUTIQUE_ONLY.includes(userRole)) {
    const singleBoutiqueId =
      allowedIds.length > 0 ? allowedIds[0] : defaultId;
    const boutiqueIds =
      singleBoutiqueId && allowedIds.includes(singleBoutiqueId)
        ? [singleBoutiqueId]
        : allowedIds.length > 0
          ? [allowedIds[0]]
          : defaultId
            ? [defaultId]
            : [];
    const boutiqueId = boutiqueIds[0] ?? '';
    const label = await buildLabel('BOUTIQUE', boutiqueIds);
    return { scope: 'BOUTIQUE', boutiqueId, boutiqueIds, label };
  }

  if (!SCOPE_FULL.includes(userRole)) {
    const boutiqueIds =
      allowedIds.length > 0 ? [allowedIds[0]] : defaultId ? [defaultId] : [];
    const boutiqueId = boutiqueIds[0] ?? '';
    const label = await buildLabel('BOUTIQUE', boutiqueIds);
    return { scope: 'BOUTIQUE', boutiqueId, boutiqueIds, label };
  }

  let candidateIds: string[] = [];
  let scope: ScopeKind = 'BOUTIQUE';

  if (requestedScope?.scope) {
    candidateIds = await resolveSelectionToBoutiqueIds(requestedScope);
    scope = requestedScope.scope;
  }

  const filtered = candidateIds.filter((id) => allowedIds.includes(id));
  const boutiqueIds =
    filtered.length > 0
      ? filtered
      : defaultId && allowedIds.includes(defaultId)
        ? [defaultId]
        : allowedIds.length > 0
          ? [allowedIds[0]]
          : [];

  const boutiqueId = boutiqueIds[0] ?? '';
  const label = await buildLabel(scope, boutiqueIds);
  return { scope: boutiqueIds.length > 0 ? scope : 'BOUTIQUE', boutiqueId, boutiqueIds, label };
}

/**
 * Get stored scope preference for user (from UserPreference.scopeJson).
 */
export async function getStoredScopePreference(
  userId: string
): Promise<ScopeSelectionJson | null> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { scopeJson: true },
  });
  if (!pref?.scopeJson) return null;
  try {
    const parsed = JSON.parse(pref.scopeJson) as ScopeSelectionJson;
    return parsed?.scope ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve scope using stored preference + optional override. Use for API handlers.
 */
export async function resolveScopeForUser(
  userId: string,
  userRole: Role,
  requestedOverride?: ScopeSelectionJson | null
): Promise<ResolvedScope> {
  const stored = await getStoredScopePreference(userId);
  const requested = requestedOverride ?? stored;
  return resolveScope(userId, userRole, requested);
}
