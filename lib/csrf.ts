import { randomBytes, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export const CSRF_COOKIE = 'dt_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Double-submit cookie: header must match cookie value. Same-origin fallback when cookie is blocked. */
export function validateCsrf(request: NextRequest): boolean {
  const header = request.headers.get(CSRF_HEADER)?.trim();
  if (!header || header.length < 32) return false;

  const cookie = request.cookies.get(CSRF_COOKIE)?.value?.trim();
  if (cookie && safeEqual(header, cookie)) return true;

  // Some browsers / proxies drop non-HttpOnly cookies on fetch; allow same-origin header-only token.
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!cookie && (fetchSite === 'same-origin' || fetchSite === 'same-site')) {
    return true;
  }

  return false;
}

export function csrfCookie(token: string, secure: boolean) {
  return {
    name: CSRF_COOKIE,
    value: token,
    httpOnly: false,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 8,
  };
}

export function isProductionSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}
