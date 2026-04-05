'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { useI18n } from '@/app/providers';
import { SidebarBrandingScope } from '@/components/nav/SidebarBrandingScope';
import { SidebarNavContent } from '@/components/nav/SidebarNavContent';
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
  const { t, locale, isRtl } = useT();
  const { setLocale } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  void canEditSchedule;
  void canApproveWeek;

  const isItemActive = useCallback(
    (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href + '/')),
    [pathname]
  );

  const closeDrawer = () => setDrawerOpen(false);

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
          onClick={closeDrawer}
          aria-hidden
        />
      )}

      {/* Drawer — same nav model as desktop Sidebar */}
      <div
        className={`fixed inset-y-0 z-50 h-full w-64 max-w-[85vw] bg-surface shadow-lg transition-transform md:hidden ${
          isRtl ? 'right-0' : 'left-0'
        } ${drawerOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'}`}
      >
        <div className="flex h-full min-w-0 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-4">
            <Link
              href="/"
              onClick={closeDrawer}
              className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground hover:text-foreground/90"
            >
              {t('nav.appTitle')}
            </Link>
            <button
              type="button"
              onClick={closeDrawer}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-surface-subtle"
              aria-label="Close"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="shrink-0 border-b border-border px-4 py-3">
            <SidebarBrandingScope role={role} pathname={pathname} showAppTitle={false} />
          </div>

          <nav className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <SidebarNavContent role={role} isItemActive={isItemActive} onNavigate={closeDrawer} />
          </nav>

          <div className="shrink-0 border-t border-border px-4 py-4">
            {name ? (
              <div className="mb-3">
                <div className="text-sm font-medium text-foreground">{name}</div>
                <div className="text-xs text-muted">{getRoleDisplayLabel(role, position ?? null, t)}</div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Link
                href="/change-password"
                onClick={closeDrawer}
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
                className="h-9 w-full rounded-md px-3 text-start text-sm text-foreground hover:bg-surface-subtle"
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
