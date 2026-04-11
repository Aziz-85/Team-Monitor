/**
 * Stable composite key for SalesEntry admin import (audit + duplicate detection).
 * Keep in sync with DB @@unique([boutiqueId, dateKey, userId]).
 */

export function normalizeImportKeyPart(s: string): string {
  return String(s ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function salesEntryImportStableKey(boutiqueId: string, dateKey: string, userId: string): string {
  return `${normalizeImportKeyPart(boutiqueId)}|${normalizeImportKeyPart(dateKey)}|${normalizeImportKeyPart(userId)}`;
}

export type ImportCellForDedupe = {
  boutiqueId: string;
  dateKey: string;
  userId: string;
  amount: number;
  rowLabel: string;
};

/** Same stable key appearing more than once in one file → data integrity risk. */
export function findDuplicateStableKeysInImport(
  cells: ImportCellForDedupe[]
): Array<{ stableKey: string; entries: ImportCellForDedupe[] }> {
  const map = new Map<string, ImportCellForDedupe[]>();
  for (const c of cells) {
    const k = salesEntryImportStableKey(c.boutiqueId, c.dateKey, c.userId);
    const list = map.get(k) ?? [];
    list.push(c);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .filter(([, list]) => list.length > 1)
    .map(([stableKey, entries]) => ({ stableKey, entries }));
}
