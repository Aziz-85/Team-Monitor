/**
 * SCOPE CONTEXT — Per-request effective boutique for SUPER_ADMIN (no switching)
 * ----------------------------------------------------------------------------
 * For SUPER_ADMIN only: resolve effective boutiqueId from URL (?b= or ?boutique=) or
 * header (X-Boutique-Code). Validates UserBoutiqueMembership.canAccess. Never persists.
 * Non-SUPER_ADMIN: always return user.boutiqueId; request params ignored.
 */

import type { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

export type UserForScope = { id: string; role: string; boutiqueId: string | null };

const BOUTIQUE_PARAM_KEYS = ['b', 'boutique'] as const;
const BOUTIQUE_HEADER = 'x-boutique-code';

/**
 * Read requested boutique code from URL search params or header (case-insensitive for header).
 */
function getRequestedBoutiqueCode(request: NextRequest): string | null {
  const url = request.nextUrl;
  for (const key of BOUTIQUE_PARAM_KEYS) {
    const v = url.searchParams.get(key)?.trim();
    if (v) return v;
  }
  const header = request.headers.get(BOUTIQUE_HEADER)?.trim();
  if (header) return header;
  return null;
}

/**
 * Resolve effective boutiqueId for this request. Session-bound: never modifies user or session.
 * - Non-SUPER_ADMIN: always user.boutiqueId (request ignored).
 * - SUPER_ADMIN: if ?b=CODE or X-Boutique-Code: CODE present, validate via UserBoutiqueMembership
 *   (userId, boutique by code, canAccess=true); if valid return that boutique.id, else fallback to user.boutiqueId.
 *   If param missing, return user.boutiqueId.
 */
export async function resolveEffectiveBoutiqueId(
  user: UserForScope,
  request: NextRequest | null,
  tx: PrismaClient = prisma
): Promise<{ boutiqueId: string; requestedCode?: string; fromContext: boolean }> {
  const defaultId = user.boutiqueId ?? '';

  if ((user.role as string) !== 'SUPER_ADMIN') {
    return { boutiqueId: defaultId, fromContext: false };
  }

  if (!request) {
    return { boutiqueId: defaultId, fromContext: false };
  }

  const requestedCode = getRequestedBoutiqueCode(request);
  if (!requestedCode) {
    return { boutiqueId: defaultId, fromContext: false };
  }

  const boutique = await tx.boutique.findFirst({
    where: { code: requestedCode, isActive: true },
    select: { id: true },
  });
  if (!boutique) {
    return { boutiqueId: defaultId, fromContext: false };
  }

  const membership = await tx.userBoutiqueMembership.findUnique({
    where: {
      userId_boutiqueId: { userId: user.id, boutiqueId: boutique.id },
    },
    select: { canAccess: true },
  });
  if (!membership?.canAccess) {
    return { boutiqueId: defaultId, fromContext: false };
  }

  // Optional: audit success (non-blocking)
  try {
    await tx.authAuditLog.create({
      data: {
        event: 'BOUTIQUE_CONTEXT_VIEW',
        userId: user.id,
        metadata: { requestedCode, resolvedBoutiqueId: boutique.id },
      },
    });
  } catch {
    // Audit must not block the request
  }

  return {
    boutiqueId: boutique.id,
    requestedCode,
    fromContext: true,
  };
}
