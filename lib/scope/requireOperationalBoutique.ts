/**
 * REQUIRE OPERATIONAL BOUTIQUE — Session-bound only (no switching)
 * ----------------------------------------------------------------
 * Delegates to SSOT requireBoutiqueScope. For SUPER_ADMIN, pass request so ?b= is respected.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireBoutiqueScope } from '@/lib/scope/ssot';

export type RequireOperationalBoutiqueResult = {
  boutiqueId: string;
  boutiqueLabel: string;
};

export type RequireOperationalBoutiqueReturn =
  | { ok: true; boutiqueId: string; boutiqueLabel: string }
  | { ok: false; res: NextResponse };

export async function requireOperationalBoutique(request?: NextRequest | null): Promise<RequireOperationalBoutiqueReturn> {
  const result = await requireBoutiqueScope(request ?? null, {
    allowGlobal: false,
    modeName: 'RequireOperationalBoutique',
  });
  if (result.res) return { ok: false, res: result.res };
  const scope = result.scope;
  if (!scope.boutiqueId) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Account not assigned to a boutique' },
        { status: 403 }
      ),
    };
  }
  return {
    ok: true,
    boutiqueId: scope.boutiqueId,
    boutiqueLabel: scope.label,
  };
}
