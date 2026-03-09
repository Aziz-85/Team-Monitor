'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { useI18n } from '@/app/providers';
import { getRoleDisplayLabel } from '@/lib/roleLabel';
import type { Role, EmployeePosition } from '@prisma/client';

export type DesktopTopBarProps = {
  /** User display name (e.g. from user.employee?.name) */
  name?: string;
  /** User role for display in dropdown */
  role?: Role;
  /** Employee position (used with EMPLOYEE role for label) */
  position?: EmployeePosition | null;
};

/**
 * Desktop-only top bar: app name, locale, profile dropdown (role, change password, logout).
 * Rendered in dashboard layout above main content; hidden on mobile (MobileTopBar used instead).
 */
export function DesktopTopBar({ name, role, position }: DesktopTopBarProps) {
  const { t, locale } = useT();
  const { setLocale } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-10 hidden min-w-0 border-b border-border bg-surface-elevated md:flex md:items-center md:justify-between md:px-4 md:py-2.5">
      <div className="min-w-0">
        <Link
          href="/"
          className="text-base font-semibold text-foreground hover:text-muted truncate block min-w-0"
        >
          {t('nav.appTitle')}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as 'en' | 'ar')}
          className="h-8 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label={t('common.language')}
        >
          <option value="en">{t('common.english')}</option>
          <option value="ar">{t('common.arabic')}</option>
        </select>
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-surface-subtle min-w-0"
            aria-expanded={profileOpen}
            aria-haspopup="true"
          >
            <span className="truncate max-w-[120px]">{name || t('common.name')}</span>
            <svg className="h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {profileOpen && (
            <div className="absolute end-0 top-full z-20 mt-1 min-w-[160px] rounded-md border border-border bg-surface-elevated py-1 shadow-md">
              {role != null && (
                <div className="border-b border-border px-3 py-2 text-sm text-muted">
                  <span className="font-medium text-foreground">{t('common.role')}:</span>{' '}
                  {getRoleDisplayLabel(role, position ?? null, t)}
                </div>
              )}
              <Link
                href="/change-password"
                onClick={() => setProfileOpen(false)}
                className="block px-3 py-2 text-sm text-foreground hover:bg-surface-subtle"
              >
                {t('nav.changePassword')}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  setProfileOpen(false);
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="w-full text-start px-3 py-2 text-sm text-foreground hover:bg-surface-subtle"
              >
                {t('common.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
