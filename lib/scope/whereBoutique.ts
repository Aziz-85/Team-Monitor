/**
 * WHERE BOUTIQUE — Shared filter builders for boutique-scoped queries
 * --------------------------------------------------------------------
 * Use for Employee and any model that has boutiqueId.
 */

/** Where clause for Employee / any model with boutiqueId. */
export function whereEmployeeBoutique(boutiqueId: string): { boutiqueId: string } {
  return { boutiqueId: boutiqueId.trim() };
}

/** Where clause for Prisma: boutiqueId in list (use only when explicitly multi-boutique, e.g. admin). */
export function whereBoutiqueIn(boutiqueIds: string[]): { boutiqueId: { in: string[] } } {
  return { boutiqueId: { in: boutiqueIds.filter(Boolean) } };
}

/** Build where clause from operational scope (single boutique). Use on all operational queries. */
export function buildBoutiqueWhere(scope: { boutiqueId: string } | null): { boutiqueId: string } | null {
  if (!scope?.boutiqueId?.trim()) return null;
  return { boutiqueId: scope.boutiqueId.trim() };
}
