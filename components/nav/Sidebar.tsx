'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getNavGroupsForUser } from '@/lib/navConfig';
import { OperationalBoutiqueSelector } from '@/components/scope/OperationalBoutiqueSelector';
import { SuperAdminBoutiqueContextPicker } from '@/components/scope/SuperAdminBoutiqueContextPicker';
import type { Role, EmployeePosition } from '@prisma/client';

const DEFAULT_OPEN_GROUPS: Record<string, boolean> = {
  DASHBOARD: true,
  TEAM: true,
  SALES: false,
  TASKS: false,
  INVENTORY: false,
  REPORTS: false,
  ORGANIZATION: false,
  RULES_TEMPLATES: false,
  INTEGRATIONS: false,
  DATA_IMPORTS: false,
  SYSTEM_ADMIN: false,
  HELP: false,
  AREA_MANAGER: false,
};

export function Sidebar({
  role,
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
  const { t, isRtl } = useT();

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
    <aside className={`hidden h-screen w-48 flex-col bg-surface lg:w-52 md:flex ${isRtl ? 'border-l border-border' : 'border-r border-border'}`}>
      <div className="flex min-w-0 flex-col h-full">
        {/* Header + Scope */}
        <div className="shrink-0 border-b border-border px-2.5 py-3">
          <Link href="/" className="text-lg font-semibold text-foreground hover:text-muted truncate block min-w-0">
            {t('nav.appTitle')}
          </Link>
          {!pathname.startsWith('/admin') && (
            <div className="mt-2 min-w-0">
              <p className="text-xs font-medium text-muted mb-1">{t('common.workingOnBoutique')}:</p>
              {role === 'SUPER_ADMIN' ? (
                <SuperAdminBoutiqueContextPicker />
              ) : (
                <OperationalBoutiqueSelector role={role} />
              )}
            </div>
          )}
        </div>

        {/* Nav: collapsible groups */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 min-w-0">
          <ul className="space-y-0.5">
            {groups.map((group) => {
              const isOpen = openKeys[group.key] ?? false;
              const isReportsWithExecutive = group.key === 'REPORTS' && group.items.some((i) => i.href === '/executive');
              const primaryHref = isReportsWithExecutive ? '/executive' : null;
              return (
                <li key={group.key} className="min-w-0">
                  <div className="flex w-full items-center gap-0.5 rounded-md min-w-0">
                    {primaryHref ? (
                      <Link
                        href={primaryHref}
                        className="flex-1 min-w-0 rounded-md px-2.5 py-1.5 text-start text-xs font-medium uppercase tracking-wide text-muted hover:bg-surface-subtle hover:text-foreground truncate"
                      >
                        <span className="truncate min-w-0 block">{t(group.labelKey)}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex-1 min-w-0 rounded-md px-2.5 py-1.5 text-start text-xs font-medium uppercase tracking-wide text-muted hover:bg-surface-subtle hover:text-foreground truncate"
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
                      className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-subtle hover:text-foreground"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? '−' : '+'}
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="mt-0.5 space-y-0.5 border-s border-border ms-2.5 ps-2">
                      {group.items.map((item) => {
                        const active = isItemActive(item.href);
                        return (
                          <li key={item.href} className="min-w-0">
                            <Link
                              href={item.href}
                              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors min-w-0 truncate ${
                                active
                                  ? `bg-surface-subtle font-medium text-foreground ${isRtl ? 'border-r-4 border-r-accent' : 'border-l-4 border-l-accent'}`
                                  : 'text-foreground hover:bg-surface-subtle'
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
      </div>
    </aside>
  );
}
