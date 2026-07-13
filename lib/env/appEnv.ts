/**
 * Application environment (production | staging | local).
 * Prefer APP_ENV over NODE_ENV — staging runs with NODE_ENV=production.
 */

export type AppEnv = 'production' | 'staging' | 'local';

const APP_ENV_VALUES: AppEnv[] = ['production', 'staging', 'local'];

function normalizeAppEnv(value: string | undefined): AppEnv | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  return APP_ENV_VALUES.includes(v as AppEnv) ? (v as AppEnv) : null;
}

/** Resolved app environment for policy, UI, and cookie isolation. */
export function getAppEnv(): AppEnv {
  const explicit = normalizeAppEnv(process.env.APP_ENV);
  if (explicit) return explicit;

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'local';
  return 'local';
}

export function isStaging(): boolean {
  return getAppEnv() === 'staging';
}

export function isProduction(): boolean {
  return getAppEnv() === 'production';
}

export function isLocal(): boolean {
  return getAppEnv() === 'local';
}

/** HTTPS cookies in production builds (includes staging). */
export function shouldUseSecureCookies(): boolean {
  return process.env.NODE_ENV === 'production';
}
