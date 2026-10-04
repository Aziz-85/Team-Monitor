'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getSidebarGroupedSections, getSidebarSectionHref } from '@/lib/nav/sidebarShellNav';
import type { Role } from '@prisma/client';

const PRIMARY_COUNT = 4;
const PREFERRED_BOTTOM_HREFS = ['/', '/nav/team', '/nav/operations', '/nav/analytics'] as const;

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
    if (getSidebarSectionHref(pathname) === pathOnly) return true;
    return false;
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_36px_-24px_rgba(15,23,42,.45)] backdrop-blur-xl md:hidden">
      {moreOpen && rest.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
          />
          <section className="relative max-h-[72dvh] w-full overflow-hidden rounded-t-[28px] border-t border-border bg-surface shadow-[0_-24px_70px_-34px_rgba(15,23,42,.65)]">
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Navigation</p>
                <h2 className="mt-1 text-lg font-black text-foreground">More destinations</h2>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-subtle text-lg text-foreground"
                aria-label="Close navigation menu"
              >
                ×
              </button>
            </div>
            <div className="max-h-[calc(72dvh-88px)] overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <ul className="grid grid-cols-2 gap-2">
                {rest.map((item) => (
                  <li key={`${item.href}:${item.key}`}>
                    <Link
                      href={item.href}
                      className={`flex min-h-14 items-center rounded-2xl border px-3 py-2.5 text-sm font-bold transition ${
                        isActive(item.href)
                          ? 'border-accent/30 bg-accent-soft text-accent'
                          : 'border-border/70 bg-surface-subtle/60 text-foreground hover:border-accent/25 hover:bg-accent-soft/60'
                      }`}
                      onClick={() => setMoreOpen(false)}
                    >
                      <span className="line-clamp-2">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      ) : null}
      <div className="flex min-h-[58px] items-stretch justify-around gap-1 px-2">
        {primary.map((item) => (
          <Link
            key={`${item.href}:${item.key}`}
            href={item.href}
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-bold leading-tight transition ${
              isActive(item.href) ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isActive(item.href) ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" /> : null}
            <span className="line-clamp-2 w-full text-center">{item.label}</span>
          </Link>
        ))}
        {rest.length > 0 ? (
          <button
            type="button"
            aria-expanded={moreOpen}
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-bold transition ${moreOpen ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span className="line-clamp-2 w-full text-center">{t('nav.more')}</span>
          </button>
        ) : null}
      </div>
    </nav>
  );
}
