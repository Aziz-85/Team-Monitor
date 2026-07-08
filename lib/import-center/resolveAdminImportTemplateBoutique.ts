/**
 * Shared admin template route helper — resolve boutique + error response.
 */

import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { resolveImportTemplateBoutique, type ImportTemplateBoutique } from './boutiqueTemplateScope';

export async function requireAdminImportTemplateBoutique(
  user: { id: string; role: Role },
  paramBoutiqueId?: string | null
): Promise<{ boutique: ImportTemplateBoutique } | { res: NextResponse }> {
  const boutique = await resolveImportTemplateBoutique(user.id, user.role, paramBoutiqueId);
  if (!boutique) {
    return {
      res: NextResponse.json(
        {
          error:
            'Select a boutique in the scope selector or choose a boutique you can access.',
        },
        { status: 403 }
      ),
    };
  }
  return { boutique };
}
