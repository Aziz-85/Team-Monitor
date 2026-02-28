import { readFileSync } from 'fs';
import { join } from 'path';

const FALLBACK = '0.0.0';

export function getAppVersion(): string {
  try {
    const p = join(process.cwd(), 'VERSION');
    return readFileSync(p, 'utf8').trim() || FALLBACK;
  } catch {
    return FALLBACK;
  }
}
