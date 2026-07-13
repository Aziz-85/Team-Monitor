import { createHash } from 'node:crypto';

/** Stable scope key for a single operational boutique. */
export function importScopeKeyForBoutique(boutiqueId: string): string {
  return `boutique:${boutiqueId}`;
}

/** Stable scope key when import spans multiple allowed boutiques (targets). */
export function importScopeKeyForBoutiqueSet(boutiqueIds: string[]): string {
  const sorted = Array.from(new Set(boutiqueIds.filter(Boolean))).sort();
  if (sorted.length === 1) return importScopeKeyForBoutique(sorted[0]!);
  const digest = createHash('sha256').update(sorted.join('|')).digest('hex').slice(0, 16);
  return `boutiques:${digest}`;
}
