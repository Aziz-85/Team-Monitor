'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getSidebarGroupedSections } from '@/lib/nav/sidebarShellNav';
import type { Role } from '@prisma/client';

const PRIMARY_COUNT = 4;
const PREFERRED_BOTTOM_HREFS = ['/', '/schedule/view', '/tasks', '/inventory/daily'] as const;

export function MobileBottomNav({
  role,
  canEditSchedule,
  canApproveWeek,
}: {
  role: Role;
  canEditSchedule: boolean;
  canApproveWeek: boolean;
}) {
  const pathname = usePathname();
  const { t } = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  void canEditSchedule;
  void canApproveWeek;

  const links = useMemo(
    () => {
      const grouped = getSidebarGroupedSections(role, t);
      const flat = grouped.flatMap((group) => group.items);
      const byHref = new Map(flat.map((item) => [item.href, item]));
      const preferred = PREFERRED_BOTTOM_HREFS.map((href) => byHref.get(href)).filter(
        (item): item is NonNullable<typeof item> => Boolean(item)
      );
      const chosen = new Set(preferred.map((item) => item.href));
      const remainder = flat.filter((item) => !chosen.has(item.href));
      return [...preferred, ...remainder];
    },
    [role, t]
  );

  const primary = links.slice(0, PRIMARY_COUNT);
  const rest = links.slice(PRIMARY_COUNT);

  const isActive = (href: string) => {
    const pathOnly = href.split('?')[0] ?? href;
    if (pathname === pathOnly) return true;
    if (pathOnly !== '/' && pathname.startsWith(pathOnly + '/')) return true;
    return false;
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_-24px_rgba(15,23,42,.55)] backdrop-blur-xl md:hidden">
      <div className="flex min-h-[62px] items-stretch justify-around gap-1 px-1.5 py-1.5">
        {primary.map((item) => (
          <Link
            key={`${item.href}:${item.key}`}
            href={item.href}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-semibold leading-tight transition ${
              isActive(item.href) ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-subtle'
            }`}
          >
            <span className={`mb-1 h-1.5 w-1.5 rounded-full ${isActive(item.href) ? 'bg-accent' : 'bg-border'}`} />
            <span className="line-clamp-2 w-full text-center">{item.label}</span>
          </Link>
        ))}
        {rest.length > 0 ? (
          <button
            type="button"
            aria-expanded={moreOpen}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-semibold transition ${moreOpen ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-subtle'}`}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span className={`mb-1 h-1.5 w-1.5 rounded-full ${moreOpen ? 'bg-accent' : 'bg-border'}`} />
            <span className="line-clamp-2 w-full text-center">{t('nav.more')}</span>
          </button>
        ) : null}
      </div>
      {moreOpen && rest.length > 0 ? (
        <div className="max-h-[40vh] overflow-y-auto border-t border-border bg-surface px-2 py-2">
          <ul className="space-y-0.5">
            {rest.map((item) => (
              <li key={`${item.href}:${item.key}`}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted/50"
                  onClick={() => setMoreOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
