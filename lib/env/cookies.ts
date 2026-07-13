import { getAppEnv } from '@/lib/env/appEnv';

/** Cookie name prefix — staging uses `dt_staging_` to avoid session bleed on shared domains. */
export function getCookiePrefix(): string {
  const explicit = process.env.COOKIE_PREFIX?.trim();
  if (explicit) {
    return explicit.endsWith('_') ? explicit : `${explicit}_`;
  }
  return getAppEnv() === 'staging' ? 'dt_staging_' : 'dt_';
}

export function getSessionCookieName(): string {
  return `${getCookiePrefix()}session`;
}

export function getCsrfCookieName(): string {
  return `${getCookiePrefix()}csrf`;
}

export function getLocaleCookieName(): string {
  return `${getCookiePrefix()}locale`;
}

/** Client-safe prefix injected at build via NEXT_PUBLIC_COOKIE_PREFIX. */
export function getPublicCookiePrefix(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COOKIE_PREFIX) {
    return process.env.NEXT_PUBLIC_COOKIE_PREFIX;
  }
  return getCookiePrefix();
}
