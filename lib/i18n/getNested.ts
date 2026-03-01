/**
 * Get nested value from messages by dot path (e.g. "auth.username").
 */
export function getNested(
  obj: Record<string, unknown>,
  path: string
): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}
