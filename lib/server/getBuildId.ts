/**
 * Server-only: read Next.js BUILD_ID. Do not import from client code.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export function getBuildId(): string {
  if (typeof process === 'undefined') return '';
  try {
    const p = join(process.cwd(), '.next', 'BUILD_ID');
    return readFileSync(p, 'utf8').trim() || '';
  } catch {
    return '';
  }
}
