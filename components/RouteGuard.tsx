'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { canAccessRoute, getPostLoginPath } from '@/lib/permissions';
import type { Role } from '@prisma/client';

export function RouteGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();
  const hasAccess = pathname ? canAccessRoute(role, pathname) : true;

  if (!pathname || hasAccess) {
    return <>{children}</>;
  }

  const backHref = getPostLoginPath(role);
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <p className="text-center text-muted">{t('common.accessDenied')}</p>
      <Link
        href={backHref}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
      >
        {t('common.back')}
      </Link>
    </div>
  );
}
