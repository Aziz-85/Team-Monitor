/**
 * Build metadata: semver, git hash, build date, environment.
 * Injected at build via next.config env (NEXT_PUBLIC_*). Safe for server and client.
 */

import { getAppEnv } from '@/lib/env/appEnv';

export const APP_VERSION =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_VERSION
    ? process.env.NEXT_PUBLIC_APP_VERSION
    : '1.0.0';

export const GIT_HASH =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GIT_HASH
    ? String(process.env.NEXT_PUBLIC_GIT_HASH).trim()
    : 'unknown';

export const BUILD_DATE =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BUILD_DATE
    ? process.env.NEXT_PUBLIC_BUILD_DATE
    : (typeof process !== 'undefined' ? new Date().toISOString() : '');

/** production | staging | local (from APP_ENV or NODE_ENV). */
export function getEnvironment(): string {
  return getAppEnv();
}

export { getAppEnv, isStaging, isProduction, isLocal } from '@/lib/env/appEnv';
