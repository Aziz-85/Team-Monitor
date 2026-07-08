export type ParsedTarget =
  | { kind: 'value'; value: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

/** Numeric-safe target parser for import templates. */
export function parseTargetValue(raw: unknown): ParsedTarget {
  if (raw == null) return { kind: 'empty' };

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return { kind: 'empty' };
    const cleaned = trimmed.replace(/,/g, '').replace(/\s+/g, '');
    if (cleaned === '') return { kind: 'empty' };
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { kind: 'error', message: 'Target must be a number' };
    if (!Number.isInteger(n)) return { kind: 'error', message: 'Target must be integer' };
    if (n < 0) return { kind: 'error', message: 'Target must be non-negative' };
    return { kind: 'value', value: n };
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { kind: 'error', message: 'Target must be a number' };
    if (!Number.isInteger(raw)) return { kind: 'error', message: 'Target must be integer' };
    if (raw < 0) return { kind: 'error', message: 'Target must be non-negative' };
    return { kind: 'value', value: raw };
  }

  return { kind: 'error', message: 'Target must be a number' };
}
