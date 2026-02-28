/**
 * EFFECTIVE BOUTIQUE — Session-bound only (no switching)
 * ------------------------------------------------------
 * effectiveBoutiqueId = user.boutiqueId from session. No selector, no preference.
 */

import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export type EffectiveBoutique = {
  id: string;
  code: string;
  name: string;
  label: string;
};

/**
 * Session-bound boutiqueId. Returns '' when not authenticated or no boutique.
 */
export async function resolveEffectiveBoutiqueId(): Promise<string> {
  const user = await getSessionUser();
  if (!user?.id) return '';
  return user.boutiqueId ?? '';
}

/**
 * Same as above for a given userId (must be current session user).
 */
export async function getEffectiveBoutiqueIdForRequest(
  userId: string,
  _reqHeaders?: Headers
): Promise<string> {
  void _reqHeaders;
  const user = await getSessionUser();
  if (!user || user.id !== userId) return '';
  return user.boutiqueId ?? '';
}

/**
 * Resolve full boutique object for display (badge, labels).
 * Returns { id, code, name, label } where label = "Name (Code)".
 */
export async function resolveEffectiveBoutique(): Promise<EffectiveBoutique | null> {
  const user = await getSessionUser();
  if (!user?.id || !user.boutiqueId) return null;
  const boutiqueId = user.boutiqueId;
  if (user.boutique) {
    return {
      id: user.boutique.id,
      code: user.boutique.code,
      name: user.boutique.name,
      label: `${user.boutique.name} (${user.boutique.code})`,
    };
  }
  const b = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!b) return { id: boutiqueId, code: boutiqueId, name: boutiqueId, label: boutiqueId };
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    label: `${b.name} (${b.code})`,
  };
}

/**
 * Get effective boutique label only (for badge text).
 */
export async function getEffectiveBoutiqueLabel(): Promise<string> {
  const b = await resolveEffectiveBoutique();
  return b?.label ?? '—';
}
