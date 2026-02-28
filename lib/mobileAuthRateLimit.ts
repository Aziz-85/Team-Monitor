/**
 * In-memory rate limit for POST /api/mobile/auth/login (per IP).
 * Resets on process restart.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 10;

const store = new Map<string, { count: number; windowStart: number }>();

function getKey(ip: string): string {
  return `mobile_login:${ip}`;
}

export function checkMobileLoginRateLimit(ip: string | null): { allowed: boolean } {
  if (!ip) return { allowed: true };
  const key = getKey(ip);
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (now - entry.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  entry.count++;
  return { allowed: entry.count <= MAX_ATTEMPTS };
}
