/**
 * Single normalizer for shift values used in schedule View merge (guest shifts).
 * AM | MORNING -> "AM"; PM | EVENING -> "PM"; anything else -> null.
 */
export function normalizeShift(s: unknown): 'AM' | 'PM' | null {
  if (s == null) return null;
  const v = String(s).trim().toUpperCase();
  if (v === 'AM' || v === 'MORNING') return 'AM';
  if (v === 'PM' || v === 'EVENING') return 'PM';
  return null;
}
