'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getNavLinksForUser } from '@/lib/navLinks';
import type { Role } from '@prisma/client';

const PRIMARY_COUNT = 4;

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

  const links = useMemo(
    () => getNavLinksForUser({ role, canEditSchedule, canApproveWeek }),
    [role, canEditSchedule, canApproveWeek]
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex min-h-[48px] items-stretch justify-around gap-0.5 px-0.5">
        {primary.map((item) => (
          <Link
            key={`${item.href}:${item.key}`}
            href={item.href}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center px-1 py-1 text-[10px] font-medium leading-tight ${
              isActive(item.href) ? 'text-accent' : 'text-muted-foreground'
            }`}
          >
            <span className="line-clamp-2 w-full text-center">{t(item.key)}</span>
          </Link>
        ))}
        {rest.length > 0 ? (
          <button
            type="button"
            aria-expanded={moreOpen}
            className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 py-1 text-[10px] font-medium text-muted-foreground"
            onClick={() => setMoreOpen((o) => !o)}
          >
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
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
