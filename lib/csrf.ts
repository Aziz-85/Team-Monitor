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

/** Double-submit cookie: header must match cookie value. */
export function validateCsrf(request: NextRequest): boolean {
  const header = request.headers.get(CSRF_HEADER)?.trim();
  const cookie = request.cookies.get(CSRF_COOKIE)?.value?.trim();
  if (!header || !cookie) return false;
  return safeEqual(header, cookie);
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
