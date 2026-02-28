'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/app/providers';
import { getNavLinksForUser } from '@/lib/permissions';
import { OperationalBoutiqueSelector } from '@/components/scope/OperationalBoutiqueSelector';
import { SuperAdminBoutiqueContextPicker } from '@/components/scope/SuperAdminBoutiqueContextPicker';
import type { Role, EmployeePosition } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

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
  const { messages, locale, setLocale } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const allLinks = getNavLinksForUser({ role, canEditSchedule, canApproveWeek });
  const isRtl = locale === 'ar';

  return (
    <>
      {/* Top Bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50"
          aria-label={t('nav.more') ?? 'Menu'}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {!pathname.startsWith('/admin') && (
            <div className="min-w-0 max-w-[140px] flex items-center gap-1">
              <span className="text-xs text-slate-500 shrink-0">{t('common.workingOnBoutiqueShort')}:</span>
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
            className="h-8 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        className={`fixed top-0 z-50 h-full w-64 bg-white shadow-lg transition-transform md:hidden ${
          isRtl ? 'right-0' : 'left-0'
        } ${drawerOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <Link
              href="/"
              onClick={() => setDrawerOpen(false)}
              className="text-lg font-semibold text-slate-900"
            >
              Team Monitor
            </Link>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50"
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
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? `bg-slate-100 font-medium text-slate-900 ${isRtl ? 'border-r-4 border-r-sky-500' : 'border-l-4 border-l-sky-500'}`
                          : 'text-slate-700 hover:bg-slate-50'
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
          <div className="border-t border-slate-200 px-4 py-4">
            {name && (
              <div className="mb-3">
                <div className="text-sm font-medium text-slate-900">{name}</div>
                <div className="text-xs text-slate-500">{getRoleDisplayLabel(role, position ?? null, t)}</div>
              </div>
            )}
            <div className="space-y-2">
              <Link
                href="/change-password"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 items-center rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('nav.changePassword')}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="w-full text-left h-9 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50"
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
