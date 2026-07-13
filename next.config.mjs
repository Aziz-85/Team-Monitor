import { createRequire } from 'module';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

function resolveAppEnv() {
  const explicit = process.env.APP_ENV?.trim().toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'local') return explicit;
  return process.env.NODE_ENV === 'production' ? 'production' : 'local';
}

function getCookiePrefix() {
  const explicit = process.env.COOKIE_PREFIX?.trim();
  if (explicit) return explicit.endsWith('_') ? explicit : `${explicit}_`;
  return resolveAppEnv() === 'staging' ? 'dt_staging_' : 'dt_';
}

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: process.cwd() }).trim();
  } catch {
    return '';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version || '1.0.0',
    NEXT_PUBLIC_GIT_HASH: getGitHash(),
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
    NEXT_PUBLIC_APP_ENV: resolveAppEnv(),
    NEXT_PUBLIC_COOKIE_PREFIX: getCookiePrefix(),
  },
  async redirects() {
    return [
      { source: '/inventory/zones/weekly', destination: '/inventory/zones', permanent: true },
      { source: '/admin/historical-import', destination: '/admin/import/historical', permanent: true },
      { source: '/admin/import/errors', destination: '/admin/import/issues', permanent: true },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
    ];
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
