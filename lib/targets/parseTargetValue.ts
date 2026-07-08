export type ParsedTarget =
  | { kind: 'value'; value: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

const ACCOUNTING_ZERO = /^[\s\-–—]+$/;
const CURRENCY_PREFIX = /^(sar|sr|ر\.س)\s*/i;

function normalizeNumericString(input: string): string {
  return input.replace(/,/g, '').replace(/\s+/g, '').replace(CURRENCY_PREFIX, '');
}

function isAccountingZeroDisplay(input: string): boolean {
  return ACCOUNTING_ZERO.test(input);
}

function parseFiniteNumber(value: string): number | null {
  const cleaned = normalizeNumericString(value);
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function validateIntegerTarget(n: number): ParsedTarget {
  if (!Number.isInteger(n)) return { kind: 'error', message: 'Target must be integer' };
  if (n < 0) return { kind: 'error', message: 'Target must be non-negative' };
  return { kind: 'value', value: n };
}

/** Numeric-safe target parser for import templates. */
export function parseTargetValue(raw: unknown): ParsedTarget {
  if (raw == null) return { kind: 'empty' };

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return { kind: 'empty' };
    if (isAccountingZeroDisplay(trimmed)) return { kind: 'value', value: 0 };

    const n = parseFiniteNumber(trimmed);
    if (n == null) return { kind: 'error', message: 'Target must be a number' };
    return validateIntegerTarget(n);
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { kind: 'error', message: 'Target must be a number' };
    return validateIntegerTarget(raw);
  }

  if (typeof raw === 'boolean') {
    return raw ? { kind: 'value', value: 1 } : { kind: 'value', value: 0 };
  }

  return { kind: 'error', message: 'Target must be a number' };
}

export function describeRawValue(raw: unknown): { type: string; display: string } {
  if (raw == null) return { type: 'null', display: '' };
  if (typeof raw === 'object') return { type: 'object', display: JSON.stringify(raw) };
  return { type: typeof raw, display: String(raw) };
}
