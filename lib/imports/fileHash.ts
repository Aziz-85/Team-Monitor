import { createHash } from 'node:crypto';

/** SHA-256 fingerprint of raw upload bytes. */
export function computeImportFileSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Constant-time compare for dry-run / apply binding. */
export function importFileHashesMatch(expected: string, actual: string): boolean {
  const a = expected.trim().toLowerCase();
  const b = actual.trim().toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
