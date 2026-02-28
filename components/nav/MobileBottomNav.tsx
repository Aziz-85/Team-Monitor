'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/app/providers';
import { getNavLinksForRole } from '@/lib/permissions';
import type { Role } from '@prisma/client';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

export function MobileBottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const { messages } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const allLinks = getNavLinksForRole(role);
  const mainLinks = allLinks.filter((l) => !l.href.startsWith('/admin') && l.href !== '/change-password').slice(0, 4);
  const moreLinks = allLinks.filter((l) => l.href.startsWith('/admin') || l.href === '/change-password');

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white py-2 md:hidden">
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
        className={`fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] overflow-auto rounded-t-xl border border-slate-200 bg-white shadow-lg transition-transform md:hidden ${moreOpen ? 'translate-y-0' : 'translate-y-full'}`}
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
