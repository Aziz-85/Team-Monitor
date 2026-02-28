/**
 * REQUIRE BOUTIQUE SESSION — Strict: scope = session user.boutiqueId only (no switching)
 * ------------------------------------------------------------------------------------
 * All data scope is derived from session user.boutiqueId. No operational selector.
 * Even ADMIN cannot switch boutiques without logging into another account.
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import type { Role } from '@prisma/client';

export type BoutiqueSession = {
  userId: string;
  role: Role;
  empId: string | null;
  boutiqueId: string;
  boutiqueLabel: string;
};

export type RequireBoutiqueSessionResult =
  | { session: BoutiqueSession; res: null }
  | { session: null; res: NextResponse };

/**
 * Require authenticated user with session-bound boutique.
 * Returns 401 if not authenticated, 403 if user has no boutiqueId.
 * Use in ALL non-admin and admin routes; scope = session boutique only.
 */
export async function requireBoutiqueSession(): Promise<RequireBoutiqueSessionResult> {
  const user = await getSessionUser();
  if (!user) {
    return { session: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const boutiqueId = user.boutiqueId ?? '';
  if (!boutiqueId) {
    return {
      session: null,
      res: NextResponse.json(
        { error: 'Account not assigned to a boutique' },
        { status: 403 }
      ),
    };
  }
  const boutiqueLabel = user.boutique
    ? `${user.boutique.name} (${user.boutique.code})`
    : boutiqueId;

  return {
    session: {
      userId: user.id,
      role: user.role as Role,
      empId: user.empId ?? null,
      boutiqueId,
      boutiqueLabel,
    },
    res: null,
  };
}
