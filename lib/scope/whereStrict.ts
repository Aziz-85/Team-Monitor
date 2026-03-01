/**
 * WHERE STRICT — Boutique filter at source (prevents scope leaks through joins)
 * ----------------------------------------------------------------------------
 * Use for executive aggregations and metrics that join on employeeId/taskId.
 * Ensures boutiqueId filter is applied in the Prisma query itself, not after fetch.
 */

/** Strict where clause: boutiqueId IN boutiqueIds. Never use without boutiqueIds. */
export function whereBoutiqueStrict(boutiqueIds: string[]): { boutiqueId: { in: string[] } } {
  const ids = boutiqueIds.filter(Boolean);
  if (ids.length === 0) {
    throw new Error('whereBoutiqueStrict: boutiqueIds must not be empty');
  }
  return { boutiqueId: { in: ids } };
}

/** For single-boutique scope. Use when scope is guaranteed one boutique. */
export function whereBoutiqueSingle(boutiqueId: string): { boutiqueId: string } {
  const id = boutiqueId?.trim();
  if (!id) {
    throw new Error('whereBoutiqueSingle: boutiqueId must not be empty');
  }
  return { boutiqueId: id };
}
