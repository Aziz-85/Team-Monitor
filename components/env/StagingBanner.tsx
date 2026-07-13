'use client';

import { getPublicCookiePrefix } from '@/lib/env/cookies';

/** Visible on every page when APP_ENV=staging (via NEXT_PUBLIC_APP_ENV). */
export function StagingBanner() {
  const appEnv =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_ENV
      ? process.env.NEXT_PUBLIC_APP_ENV
      : 'local';

  if (appEnv !== 'staging') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[100] shrink-0 border-b border-orange-400 bg-orange-500 px-3 py-2 text-center text-sm font-bold tracking-wide text-white shadow-sm"
    >
      STAGING ENVIRONMENT — Not production. Data and uploads are isolated from live users.
    </div>
  );
}

/** Read CSRF cookie using build-time prefix (staging vs production). */
export function readCsrfTokenFromDocument(): string {
  if (typeof document === 'undefined') return '';
  const name = `${getPublicCookiePrefix()}csrf`;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}
