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
    <aside className={`hidden h-screen w-56 flex-col bg-surface md:flex xl:w-60 ${isRtl ? 'border-l border-border/40' : 'border-r border-border/40'}`}>
      <div className="flex min-w-0 h-full flex-col">
        <div className="shrink-0 px-4 pb-3 pt-4">
          <SidebarBrandingScope role={role} pathname={pathname} className="" />
        </div>

        <nav className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <SidebarNavContent role={role} isItemActive={isItemActive} />
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
