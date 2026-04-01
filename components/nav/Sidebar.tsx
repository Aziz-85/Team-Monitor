'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getNavGroupsForUser } from '@/lib/navConfig';
import { OperationalBoutiqueSelector } from '@/components/scope/OperationalBoutiqueSelector';
import { SuperAdminBoutiqueContextPicker } from '@/components/scope/SuperAdminBoutiqueContextPicker';
import type { Role, EmployeePosition } from '@prisma/client';

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
  const { t, isRtl } = useT();

  const groups = useMemo(
    () => getNavGroupsForUser({ role, canEditSchedule, canApproveWeek }),
    [role, canEditSchedule, canApproveWeek]
  );
  const sectionOrder = useMemo(
    () => [
      { key: 'TEAM', label: t('nav.sidebar.team') },
      { key: 'OPERATIONS', label: t('nav.sidebar.operations') },
      { key: 'ANALYTICS', label: t('nav.sidebar.analytics') },
      { key: 'SYSTEM', label: t('nav.sidebar.system') },
    ],
    [t]
  );
  const groupedSections = useMemo(() => {
    const map = new Map<string, Array<{ href: string; key: string }>>();
    for (const section of sectionOrder) map.set(section.key, []);
    const sectionForGroup = (groupKey: string): string => {
      if (groupKey === 'DASHBOARD' || groupKey === 'TEAM') return 'TEAM';
      if (groupKey === 'TEAM' || groupKey === 'TASKS' || groupKey === 'INVENTORY') return 'OPERATIONS';
      if (groupKey === 'SALES' || groupKey === 'REPORTS' || groupKey === 'COMPANY') return 'ANALYTICS';
      return 'SYSTEM';
    };
    for (const g of groups) {
      const sectionKey = sectionForGroup(g.key);
      const arr = map.get(sectionKey);
      if (!arr) continue;
      for (const item of g.items) {
        arr.push({ href: item.href, key: item.key });
      }
    }
    return sectionOrder
      .map((s) => ({ ...s, items: map.get(s.key) ?? [] }))
      .filter((s) => s.items.length > 0);
  }, [groups, sectionOrder]);

  const isItemActive = useCallback(
    (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href + '/')),
    [pathname]
  );

  const getItemLabel = useCallback(
    (key: string) => {
      if (key === 'nav.scheduleView') return t('nav.sidebar.schedule');
      if (key === 'nav.scheduleEditorDay') return t('nav.sidebar.editDay');
      if (key === 'nav.scheduleAudit') return t('nav.sidebar.scheduleAudit');
      return t(key);
    },
    [t]
  );

  return (
    <aside className={`hidden h-screen w-56 flex-col bg-surface md:flex xl:w-60 ${isRtl ? 'border-l border-border/40' : 'border-r border-border/40'}`}>
      <div className="flex min-w-0 h-full flex-col">
        {/* Header + Scope */}
        <div className="shrink-0 px-4 pb-3 pt-4">
          <Link href="/" className="block min-w-0 truncate text-lg font-semibold text-foreground/90 hover:text-foreground">
            {t('nav.appTitle')}
          </Link>
          {!pathname.startsWith('/admin') && (
            <div className="mt-3 min-w-0 rounded-xl bg-surface-subtle/70 px-2.5 py-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{t('common.workingOnBoutique')}:</p>
              {role === 'SUPER_ADMIN' ? (
                <SuperAdminBoutiqueContextPicker />
              ) : (
                <OperationalBoutiqueSelector role={role} />
              )}
            </div>
          )}
        </div>

        <nav className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4 pt-2">
          <ul className="space-y-6">
            {groupedSections.map((section) => (
              <li key={section.key} className="min-w-0">
                <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{section.label}</p>
                <ul className="space-y-1.5">
                  {section.items.map((item) => {
                    const active = isItemActive(item.href);
                    return (
                      <li key={item.href} className="min-w-0">
                        <Link
                          href={item.href}
                          className={`group relative flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                            active ? 'bg-accent/10 text-accent' : 'text-foreground/85 hover:bg-muted/40'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                              active ? 'bg-accent' : 'bg-muted-foreground/50 group-hover:bg-muted-foreground/70'
                            }`}
                          />
                          <span className="min-w-0 truncate">{getItemLabel(item.key)}</span>
                          {active ? (
                            <span className={`absolute inset-y-1 ${isRtl ? 'right-0.5' : 'left-0.5'} w-0.5 rounded-full bg-accent/70`} />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 px-3 pb-4">
          <div className="rounded-xl bg-surface-subtle/60 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground/85">{name || t('common.user')}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{position ? String(position) : role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
