'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { useI18n } from '@/app/providers';
import { APP_VERSION } from '@/lib/version';
import { getNavGroupsForUser } from '@/lib/navConfig';
import { OperationalBoutiqueSelector } from '@/components/scope/OperationalBoutiqueSelector';
import { SuperAdminBoutiqueContextPicker } from '@/components/scope/SuperAdminBoutiqueContextPicker';
import type { Role, EmployeePosition } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

const DEFAULT_OPEN_GROUPS: Record<string, boolean> = {
  OPERATIONS: true,
  PERFORMANCE: true,
  HR_AND_TEAM: false,
  SYSTEM: false,
  HELP: false,
  AREA_MANAGER: false,
};

export function Sidebar({
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
  const { t, locale: localeFromT, isRtl } = useT();
  const { setLocale } = useI18n();

  const groups = useMemo(
    () => getNavGroupsForUser({ role, canEditSchedule, canApproveWeek }),
    [role, canEditSchedule, canApproveWeek]
  );

  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { ...DEFAULT_OPEN_GROUPS };
    return initial;
  });

  const isItemActive = useCallback(
    (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href + '/')),
    [pathname]
  );

  const activeGroupKey = useMemo(() => {
    for (const g of groups) {
      if (g.items.some((item) => isItemActive(item.href))) return g.key;
    }
    return null;
  }, [groups, isItemActive]);

  useEffect(() => {
    if (activeGroupKey != null && !openKeys[activeGroupKey]) {
      setOpenKeys((prev) => ({ ...prev, [activeGroupKey]: true }));
    }
  }, [activeGroupKey, openKeys]);

  const toggleGroup = useCallback((key: string) => {
    setOpenKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <aside className={`hidden h-screen w-52 flex-col bg-white lg:w-56 md:flex ${isRtl ? 'border-l border-slate-200' : 'border-r border-slate-200'}`}>
      <div className="flex min-w-0 flex-col h-full">
        {/* Header + Scope */}
        <div className="shrink-0 border-b border-slate-200 px-3 py-4">
          <Link href="/" className="text-lg font-semibold text-slate-900 hover:text-slate-700 truncate block min-w-0">
            {t('nav.appTitle')}
          </Link>
          {!pathname.startsWith('/admin') && (
            <div className="mt-2 min-w-0">
              <p className="text-xs font-medium text-slate-500 mb-1">{t('common.workingOnBoutique')}:</p>
              {role === 'SUPER_ADMIN' ? (
                <SuperAdminBoutiqueContextPicker />
              ) : (
                <OperationalBoutiqueSelector role={role} />
              )}
            </div>
          )}
        </div>

        {/* Nav: collapsible groups */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 min-w-0">
          <ul className="space-y-1">
            {groups.map((group) => {
              const isOpen = openKeys[group.key] ?? false;
              const isPerformanceWithExecutive = group.key === 'PERFORMANCE' && group.items.some((i) => i.href === '/executive');
              const primaryHref = isPerformanceWithExecutive ? '/executive' : null;
              return (
                <li key={group.key} className="min-w-0">
                  <div className="flex w-full items-center gap-1 rounded-lg min-w-0">
                    {primaryHref ? (
                      <Link
                        href={primaryHref}
                        className="flex-1 min-w-0 rounded-lg px-3 py-2 text-start text-sm font-medium text-slate-700 hover:bg-slate-50 truncate"
                      >
                        <span className="truncate min-w-0 block">{t(group.labelKey)}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex-1 min-w-0 rounded-lg px-3 py-2 text-start text-sm font-medium text-slate-700 hover:bg-slate-50 truncate"
                        aria-expanded={isOpen}
                      >
                        <span className="truncate min-w-0 block">{t(group.labelKey)}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleGroup(group.key);
                      }}
                      className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? '−' : '+'}
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="mt-1 space-y-0.5 ps-2 border-s border-slate-200 ms-3">
                      {group.items.map((item) => {
                        const active = isItemActive(item.href);
                        return (
                          <li key={item.href} className="min-w-0">
                            <Link
                              href={item.href}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors min-w-0 truncate ${
                                active
                                  ? `bg-slate-100 font-medium text-slate-900 ${isRtl ? 'border-r-4 border-r-sky-500' : 'border-l-4 border-l-sky-500'}`
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate min-w-0">{t(item.key)}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 px-3 py-4 min-w-0">
          {name && (
            <div className="mb-3 min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{name}</div>
              <div className="truncate text-xs text-slate-500">{getRoleDisplayLabel(role, position ?? null, t)}</div>
            </div>
          )}
          <div className="space-y-2">
            <select
              value={localeFromT}
              onChange={(e) => setLocale(e.target.value as 'en' | 'ar')}
              className="h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">{t('common.english')}</option>
              <option value="ar">{t('common.arabic')}</option>
            </select>
            <Link
              href="/change-password"
              className="flex h-9 items-center rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50 truncate min-w-0"
            >
              {t('nav.changePassword')}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="w-full text-start h-9 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50 min-w-0"
            >
              {t('common.logout')}
            </button>
          </div>
          <div className="mt-4 text-xs text-slate-400 truncate min-w-0">{t('nav.appTitle')} v{APP_VERSION}</div>
        </div>
      </div>
    </aside>
  );
}
