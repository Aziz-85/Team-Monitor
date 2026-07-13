/**
 * Server environment validation (Phase 9 — staging / production safety).
 * Fail fast on misconfiguration before serving traffic.
 */

import { z } from 'zod';
import { getAppEnv, type AppEnv } from '@/lib/env/appEnv';

export const appEnvSchema = z.enum(['production', 'staging', 'local']);

const baseEnvSchema = z.object({
  APP_ENV: appEnvSchema.optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  DATABASE_URL: z.string().optional(),
  /** Set on staging servers — must differ from DATABASE_URL (production guard). */
  PRODUCTION_DATABASE_URL: z.string().optional(),
  DEPLOY_REGISTER_SECRET: z.string().optional(),
  MOBILE_JWT_ACCESS_SECRET: z.string().optional(),
  MOBILE_JWT_REFRESH_SECRET: z.string().optional(),
  AUTH_TOTP_ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  PLANNER_WEBHOOK_SECRET: z.string().optional(),
  COOKIE_PREFIX: z.string().optional(),
  UPLOAD_ROOT: z.string().optional(),
  MONTH_SNAPSHOT_DIR: z.string().optional(),
  YOY_EXCEL_DIR: z.string().optional(),
  DEPLOY_STATE_DIR: z.string().optional(),
  APP_INTERNAL_ORIGIN: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
});

export type ParsedServerEnv = z.infer<typeof baseEnvSchema> & { resolvedAppEnv: AppEnv };

export function parseServerEnv(raw: Record<string, string | undefined> = process.env): ParsedServerEnv {
  const parsed = baseEnvSchema.parse(raw);
  return {
    ...parsed,
    resolvedAppEnv: getAppEnv(),
  };
}

function requireNonEmpty(value: string | undefined, label: string, errors: string[]): void {
  if (!value?.trim()) errors.push(`${label} is required`);
}

function requireMinLength(value: string | undefined, label: string, min: number, errors: string[]): void {
  if (!value || value.trim().length < min) {
    errors.push(`${label} must be at least ${min} characters`);
  }
}

/** Staging must not share the production database connection string. */
export function assertStagingDatabaseIsolation(env: ParsedServerEnv): void {
  const explicitAppEnv = normalizeAppEnv(env.APP_ENV);
  if (explicitAppEnv !== 'staging') return;

  const dbUrl = env.DATABASE_URL?.trim();
  const prodUrl = env.PRODUCTION_DATABASE_URL?.trim();

  if (prodUrl && dbUrl && dbUrl === prodUrl) {
    throw new Error(
      '[env] Staging DATABASE_URL must not match PRODUCTION_DATABASE_URL. Use a separate staging database.'
    );
  }

  if (dbUrl && prodUrl && dbUrl.includes('@') && prodUrl.includes('@')) {
    const stagingDb = extractDatabaseName(dbUrl);
    const prodDb = extractDatabaseName(prodUrl);
    if (stagingDb && prodDb && stagingDb === prodDb) {
      throw new Error(
        `[env] Staging database name "${stagingDb}" matches production. Use a distinct staging database.`
      );
    }
  }
}

function extractDatabaseName(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl.replace(/^postgresql:/, 'postgres:'));
    const name = u.pathname.replace(/^\//, '').split('?')[0];
    return name || null;
  } catch {
    const match = databaseUrl.match(/\/([^/?]+)(?:\?|$)/);
    return match?.[1] ?? null;
  }
}

/**
 * Validate environment for runtime. Throws on fatal misconfiguration.
 * Skipped in test unless VALIDATE_ENV_IN_TEST=1.
 */
export function validateEnvOnStartup(raw: Record<string, string | undefined> = process.env): ParsedServerEnv {
  if (raw.NODE_ENV === 'test' && raw.VALIDATE_ENV_IN_TEST !== '1') {
    return parseServerEnv(raw);
  }

  const env = parseServerEnv(raw);
  const errors: string[] = [];
  const explicitAppEnv = normalizeAppEnv(raw.APP_ENV);
  const isDeployed = explicitAppEnv === 'production' || explicitAppEnv === 'staging';

  if (isDeployed) {
    requireNonEmpty(env.DATABASE_URL, 'DATABASE_URL', errors);
    requireMinLength(env.DEPLOY_REGISTER_SECRET, 'DEPLOY_REGISTER_SECRET', 16, errors);
  }

  if (explicitAppEnv === 'staging') {
    requireNonEmpty(env.DATABASE_URL, 'DATABASE_URL', errors);
  }

  if (errors.length > 0) {
    throw new Error(`[env] Invalid server configuration:\n- ${errors.join('\n- ')}`);
  }

  assertStagingDatabaseIsolation(env);

  return env;
}

function normalizeAppEnv(value: string | undefined): AppEnv | null {
  const v = value?.trim().toLowerCase();
  if (v === 'production' || v === 'staging' || v === 'local') return v;
  return null;
}
