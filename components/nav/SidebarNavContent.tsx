'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import type { Role } from '@prisma/client';
import {
  ENTRY_DAILY_SALES_SIDEBAR_ROLES,
  getAppShellEntryDaily,
  getSidebarHubSections,
  getSidebarQuickAccess,
} from '@/lib/nav/sidebarShellNav';

type SidebarNavContentProps = {
  role: Role;
  isItemActive: (href: string) => boolean;
  onNavigate?: () => void;
};

/**
 * Shared navigation lists for desktop sidebar and mobile drawer (same links, order, and grouping).
 */
export function SidebarNavContent({ role, isItemActive, onNavigate }: SidebarNavContentProps) {
  const { t, isRtl } = useT();
  const quickAccessItems = useMemo(() => getSidebarQuickAccess(role, t), [role, t]);
  const topSections = useMemo(() => getSidebarHubSections(t), [t]);
  const showEntryDaily = ENTRY_DAILY_SALES_SIDEBAR_ROLES.includes(role);
  const entryDaily = useMemo(() => getAppShellEntryDaily(), []);

  const handleClick = () => {
    onNavigate?.();
  };

  return (
    <div className="min-w-0 px-3 pb-4 pt-2">
      <ul className="space-y-1.5">
        {quickAccessItems.map((item) => {
          const active = isItemActive(item.href);
          return (
            <li key={item.key} className="min-w-0">
              <Link
                href={item.href}
                onClick={handleClick}
                className={`group relative flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-accent/10 text-accent' : 'text-foreground/85 hover:bg-muted/40'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                    active ? 'bg-accent' : 'bg-muted-foreground/50 group-hover:bg-muted-foreground/70'
                  }`}
                />
                <span className="min-w-0 truncate">{item.label}</span>
                {active ? (
                  <span
                    className={`absolute inset-y-1 ${isRtl ? 'right-0.5' : 'left-0.5'} w-0.5 rounded-full bg-accent/70`}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-2" />

      <ul className="space-y-2">
        {topSections.map((section) => {
          const active = isItemActive(section.href);
          return (
            <li key={section.key} className="min-w-0">
              <Link
                href={section.href}
                onClick={handleClick}
                className={`group relative flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  active ? 'bg-accent/10 text-accent' : 'text-foreground/85 hover:bg-muted/40'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                    active ? 'bg-accent' : 'bg-muted-foreground/50 group-hover:bg-muted-foreground/70'
                  }`}
                />
                <span className="min-w-0 truncate uppercase tracking-[0.08em]">{section.label}</span>
                {active ? (
                  <span
                    className={`absolute inset-y-1 ${isRtl ? 'right-0.5' : 'left-0.5'} w-0.5 rounded-full bg-accent/70`}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {showEntryDaily ? (
        <>
          <div className="mt-2" />
          <ul className="space-y-1.5">
            <li className="min-w-0">
              <Link
                href={entryDaily.href}
                onClick={handleClick}
                className={`group relative flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isItemActive(entryDaily.href)
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground/85 hover:bg-muted/40'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                    isItemActive(entryDaily.href)
                      ? 'bg-accent'
                      : 'bg-muted-foreground/50 group-hover:bg-muted-foreground/70'
                  }`}
                />
                <span className="min-w-0 truncate">{t(entryDaily.labelKey)}</span>
                {isItemActive(entryDaily.href) ? (
                  <span
                    className={`absolute inset-y-1 ${isRtl ? 'right-0.5' : 'left-0.5'} w-0.5 rounded-full bg-accent/70`}
                  />
                ) : null}
              </Link>
            </li>
          </ul>
        </>
      ) : null}
    </div>
  );
}
