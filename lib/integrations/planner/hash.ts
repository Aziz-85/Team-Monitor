/**
 * Deterministic event hash for idempotency.
 */

import { createHash } from 'crypto';

export function buildEventHash(payload: unknown): string {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  return createHash('sha256').update(str, 'utf8').digest('hex');
}
