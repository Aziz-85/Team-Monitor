'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { isNavHrefActive } from '@/lib/nav/navHrefMatch';
import { useT } from '@/lib/i18n/useT';
import { useI18n } from '@/app/providers';
import { getNavLinksForUser } from '@/lib/permissions';
import { OperationalBoutiqueSelector } from '@/components/scope/OperationalBoutiqueSelector';
import { SuperAdminBoutiqueContextPicker } from '@/components/scope/SuperAdminBoutiqueContextPicker';
import type { Role, EmployeePosition } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

export function MobileTopBar({
  role,
  name,
  position,
  canEditSchedule,
  canApproveWeek,
}: {
  role: Role;
  name?: string;
  position?: EmployeePosition | null;
  canEditSchedule: boolean;
  canApproveWeek: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const searchSuffix = search ? `?${search}` : '';
  const { t, locale, isRtl } = useT();
  const { setLocale } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const allLinks = getNavLinksForUser({ role, canEditSchedule, canApproveWeek });

  return (
    <>
      {/* Top Bar */}
      <div className="sticky top-0 z-20 flex min-w-0 max-w-full items-center justify-between overflow-x-clip border-b border-border bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-subtle"
          aria-label={t('nav.more') ?? 'Menu'}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {!pathname.startsWith('/admin') && (
            <div className="flex min-w-0 max-w-[55vw] items-center gap-1 overflow-hidden">
              <span className="text-xs text-muted shrink-0">{t('common.workingOnBoutiqueShort')}:</span>
              {role === 'SUPER_ADMIN' ? (
                <SuperAdminBoutiqueContextPicker />
              ) : (
                <OperationalBoutiqueSelector role={role} />
              )}
            </div>
          )}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'ar')}
            className="h-8 shrink-0 max-w-[40vw] rounded-md border border-border bg-surface px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="en">{t('common.english')}</option>
            <option value="ar">{t('common.arabic')}</option>
          </select>
        </div>
      </div>

      {/* Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 z-50 h-full w-64 max-w-[85vw] bg-surface shadow-lg transition-transform md:hidden ${
          isRtl ? 'right-0' : 'left-0'
        } ${drawerOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <Link
              href="/"
              onClick={() => setDrawerOpen(false)}
              className="text-lg font-semibold text-foreground"
            >
              {t('nav.appTitle')}
            </Link>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-subtle"
              aria-label="Close"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Drawer Nav Links */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {allLinks.map((item) => {
                const isActive = isNavHrefActive(pathname, searchSuffix, item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? `bg-surface-subtle font-medium text-foreground ${isRtl ? 'border-r-4 border-r-accent' : 'border-l-4 border-l-accent'}`
                          : 'text-foreground hover:bg-surface-subtle'
                      }`}
                    >
                      {t(item.key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Drawer Footer */}
          <div className="border-t border-border px-4 py-4">
            {name && (
              <div className="mb-3">
                <div className="text-sm font-medium text-foreground">{name}</div>
                <div className="text-xs text-muted">{getRoleDisplayLabel(role, position ?? null, t)}</div>
              </div>
            )}
            <div className="space-y-2">
              <Link
                href="/change-password"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 items-center rounded-md px-3 text-sm text-foreground hover:bg-surface-subtle"
              >
                {t('nav.changePassword')}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="w-full text-start h-9 rounded-md px-3 text-sm text-foreground hover:bg-surface-subtle"
              >
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
