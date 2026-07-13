/**
 * Phase 9 — environment validation and staging isolation.
 */

import {
  getAppEnv,
  getCookiePrefix,
  getCsrfCookieName,
  getSessionCookieName,
  isStaging,
} from '@/lib/env';
import {
  assertStagingDatabaseIsolation,
  parseServerEnv,
  validateEnvOnStartup,
} from '@/lib/validation/env';

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    process.env = saved;
  }
}

describe('getAppEnv', () => {
  it('prefers explicit APP_ENV', () => {
    withEnv({ APP_ENV: 'staging', NODE_ENV: 'production' }, () => {
      expect(getAppEnv()).toBe('staging');
    });
  });

  it('defaults production when NODE_ENV=production and APP_ENV unset', () => {
    withEnv({ APP_ENV: undefined, NODE_ENV: 'production' }, () => {
      expect(getAppEnv()).toBe('production');
    });
  });

  it('defaults local in development', () => {
    withEnv({ APP_ENV: undefined, NODE_ENV: 'development' }, () => {
      expect(getAppEnv()).toBe('local');
    });
  });
});

describe('cookie prefix', () => {
  it('uses dt_staging_ prefix when APP_ENV=staging', () => {
    withEnv({ APP_ENV: 'staging' }, () => {
      expect(getCookiePrefix()).toBe('dt_staging_');
      expect(getSessionCookieName()).toBe('dt_staging_session');
      expect(getCsrfCookieName()).toBe('dt_staging_csrf');
      expect(isStaging()).toBe(true);
    });
  });

  it('uses dt_ prefix for production', () => {
    withEnv({ APP_ENV: 'production' }, () => {
      expect(getCookiePrefix()).toBe('dt_');
      expect(getSessionCookieName()).toBe('dt_session');
    });
  });

  it('honors COOKIE_PREFIX override', () => {
    withEnv({ APP_ENV: 'staging', COOKIE_PREFIX: 'custom' }, () => {
      expect(getCookiePrefix()).toBe('custom_');
    });
  });
});

describe('validateEnvOnStartup', () => {
  it('skips strict checks in test by default', () => {
    expect(() =>
      validateEnvOnStartup({ NODE_ENV: 'test', APP_ENV: undefined, DATABASE_URL: undefined })
    ).not.toThrow();
  });

  it('requires DATABASE_URL and DEPLOY_REGISTER_SECRET when APP_ENV=production', () => {
    expect(() =>
      validateEnvOnStartup({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        DATABASE_URL: undefined,
        DEPLOY_REGISTER_SECRET: undefined,
      })
    ).toThrow(/DATABASE_URL/);
  });

  it('passes production config when required vars present', () => {
    expect(() =>
      validateEnvOnStartup({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/dhahran_prod',
        DEPLOY_REGISTER_SECRET: 'x'.repeat(16),
      })
    ).not.toThrow();
  });

  it('does not require secrets during CI build without explicit APP_ENV', () => {
    expect(() =>
      validateEnvOnStartup({
        NODE_ENV: 'production',
        APP_ENV: undefined,
        DATABASE_URL: undefined,
      })
    ).not.toThrow();
  });
});

describe('assertStagingDatabaseIsolation', () => {
  it('throws when staging DATABASE_URL matches production', () => {
    const url = 'postgresql://u:p@localhost:5432/dhahran_prod';
    const env = parseServerEnv({
      APP_ENV: 'staging',
      DATABASE_URL: url,
      PRODUCTION_DATABASE_URL: url,
    });
    expect(() => assertStagingDatabaseIsolation(env)).toThrow(/must not match/);
  });

  it('throws when database name matches production', () => {
    const env = parseServerEnv({
      APP_ENV: 'staging',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/dhahran_prod',
      PRODUCTION_DATABASE_URL: 'postgresql://other:p@remote:5432/dhahran_prod',
    });
    expect(() => assertStagingDatabaseIsolation(env)).toThrow(/distinct staging database/);
  });

  it('allows distinct staging database', () => {
    const env = parseServerEnv({
      APP_ENV: 'staging',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/dhahran_staging',
      PRODUCTION_DATABASE_URL: 'postgresql://u:p@localhost:5432/dhahran_prod',
    });
    expect(() => assertStagingDatabaseIsolation(env)).not.toThrow();
  });
});
