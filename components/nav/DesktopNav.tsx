'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/app/providers';
import { getNavLinksForRole } from '@/lib/permissions';
import type { Role } from '@prisma/client';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

export function DesktopNav({ role, name }: { role: Role; name?: string }) {
  const pathname = usePathname();
  const { messages, locale, setLocale } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const links = getNavLinksForRole(role).filter((item) => item.href !== '/change-password');

  return (
    <nav className="hidden border-b border-slate-200 bg-white md:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold text-slate-900">
            Team Monitor
          </Link>
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-base ${pathname === item.href ? 'font-semibold text-sky-600' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {t(item.key)}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">{name ?? ''}</span>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'ar')}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="en">{t('common.english')}</option>
            <option value="ar">{t('common.arabic')}</option>
          </select>
          <Link
            href="/change-password"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            {t('nav.changePassword')}
          </Link>
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            {t('common.logout')}
          </button>
        </div>
      </div>
    </nav>
  );
}
