/** Environment detection and cookie isolation (Architecture Stabilization Phase 9). */

export {
  getAppEnv,
  isStaging,
  isProduction,
  isLocal,
  shouldUseSecureCookies,
  type AppEnv,
} from '@/lib/env/appEnv';

export {
  getCookiePrefix,
  getSessionCookieName,
  getCsrfCookieName,
  getLocaleCookieName,
  getPublicCookiePrefix,
} from '@/lib/env/cookies';

export {
  parseServerEnv,
  validateEnvOnStartup,
  assertStagingDatabaseIsolation,
  type ParsedServerEnv,
} from '@/lib/validation/env';
