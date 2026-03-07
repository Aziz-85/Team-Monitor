'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getNavLinksForUser } from '@/lib/permissions';
import type { Role } from '@prisma/client';

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

  const allLinks = getNavLinksForUser({ role, canEditSchedule, canApproveWeek });
  const mainLinks = allLinks.filter((l) => !l.href.startsWith('/admin') && l.href !== '/change-password').slice(0, 4);
  const moreLinks = allLinks.filter((l) => l.href.startsWith('/admin') || l.href === '/change-password');

  return (
    <>
      <nav className="fixed bottom-0 start-0 end-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white py-2 md:hidden">
        {mainLinks.slice(0, 4).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-sm ${pathname === l.href ? 'font-semibold text-sky-600' : 'text-slate-600'}`}
          >
            {t(l.key)}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-sm text-slate-600"
        >
          {t('nav.more')}
        </button>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={`fixed bottom-0 start-0 end-0 z-50 max-h-[70vh] overflow-auto rounded-t-xl border border-slate-200 bg-white shadow-lg transition-transform md:hidden ${moreOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="sticky top-0 border-b border-slate-200 bg-white px-4 py-3 font-semibold">
          {t('nav.more')}
        </div>
        <div className="p-4">
          {moreLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMoreOpen(false)}
              className="block py-3 text-base text-slate-700 hover:text-slate-900"
            >
              {t(l.key)}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
