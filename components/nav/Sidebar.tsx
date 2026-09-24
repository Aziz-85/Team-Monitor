'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { SidebarBrandingScope } from '@/components/nav/SidebarBrandingScope';
import { SidebarNavContent } from '@/components/nav/SidebarNavContent';
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
  void canEditSchedule;
  void canApproveWeek;

  const isItemActive = useCallback(
    (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href + '/')),
    [pathname]
  );

  return (
    <aside className={`app-sidebar hidden h-screen w-60 flex-col md:flex xl:w-64 ${isRtl ? 'border-l border-border/70' : 'border-r border-border/70'}`}>
      <div className="flex min-w-0 h-full flex-col">
        <div className="shrink-0 px-4 pb-4 pt-5">
          <SidebarBrandingScope role={role} pathname={pathname} className="" />
        </div>

        <nav className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <SidebarNavContent role={role} isItemActive={isItemActive} />
        </nav>

        <div className="shrink-0 border-t border-border/60 px-3 py-3">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-subtle/70 px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-xs font-bold text-white shadow-sm">
              {(name || t('common.user')).trim().slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground/90">{name || t('common.user')}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted">{position ? String(position) : role}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
