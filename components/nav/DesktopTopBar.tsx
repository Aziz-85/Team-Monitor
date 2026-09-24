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
    <header className="app-topbar sticky top-0 z-30 hidden min-w-0 border-b border-border/70 md:flex md:h-14 md:items-center md:justify-between md:px-5">
      <div className="min-w-0">
        <Link
          href="/"
          className="block min-w-0 truncate text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-accent"
        >
          {t('nav.appTitle')}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as 'en' | 'ar')}
          className="h-9 rounded-xl border border-border/80 bg-surface px-3 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label={t('common.language')}
        >
          <option value="en">{t('common.english')}</option>
          <option value="ar">{t('common.arabic')}</option>
        </select>
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-surface"
            aria-expanded={profileOpen}
            aria-haspopup="true"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-[10px] font-bold text-accent">
              {(name || t('common.name')).trim().slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate max-w-[140px]">{name || t('common.name')}</span>
            <svg className="h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {profileOpen && (
            <div className="absolute end-0 top-full z-20 mt-2 min-w-[210px] overflow-hidden rounded-2xl border border-border bg-surface-elevated py-1.5 shadow-lg">
              {role != null && (
                <div className="border-b border-border px-3 py-2 text-sm text-muted">
                  <span className="font-medium text-foreground">{t('common.role')}:</span>{' '}
                  {getRoleDisplayLabel(role, position ?? null, t)}
                </div>
              )}
              <Link
                href="/settings/security"
                onClick={() => setProfileOpen(false)}
                className="block px-3 py-2 text-sm text-foreground hover:bg-surface-subtle"
              >
                {t('nav.securitySettings')}
              </Link>
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
