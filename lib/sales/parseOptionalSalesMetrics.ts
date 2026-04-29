/**
 * Shared parsing for optional `invoiceCount` / `pieceCount` on sales entry APIs.
 * Omitted, null, or empty string → not provided (caller should omit from upsert).
 */
export type ParsedOptionalMetric =
  | { provided: false }
  | { provided: true; value: number }
  | { error: string };

export function parseOptionalNonNegativeInt(
  v: unknown,
  fieldLabel: 'invoiceCount' | 'pieceCount'
): ParsedOptionalMetric {
  if (v === undefined || v === null) return { provided: false };
  if (typeof v === 'string' && v.trim() === '') return { provided: false };
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { error: `${fieldLabel} must be a non-negative integer` };
  }
  return { provided: true, value: n };
}
