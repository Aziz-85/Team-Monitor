/**
 * SalesEntry rows that may be updated via historical correction import (MANUAL is never touched).
 */

const BLOCKED = new Set(['MANUAL']);

export function isCorrectableSalesEntrySource(source: string | null | undefined): boolean {
  const s = (source ?? '').trim().toUpperCase();
  if (!s) return true;
  return !BLOCKED.has(s);
}
