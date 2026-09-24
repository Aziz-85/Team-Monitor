'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { OperationalBoutiqueSelector } from '@/components/scope/OperationalBoutiqueSelector';
import { SuperAdminBoutiqueContextPicker } from '@/components/scope/SuperAdminBoutiqueContextPicker';
import type { Role } from '@prisma/client';

type SidebarBrandingScopeProps = {
  role: Role;
  pathname: string;
  onTitleClick?: () => void;
  /** Extra class on outer wrapper (e.g. desktop px-4) */
  className?: string;
  /** When false, only the boutique scope panel is rendered (e.g. mobile drawer below header row). */
  showAppTitle?: boolean;
};

/** App title + operational boutique scope — shared by desktop sidebar and mobile drawer. */
export function SidebarBrandingScope({
  role,
  pathname,
  onTitleClick,
  className = '',
  showAppTitle = true,
}: SidebarBrandingScopeProps) {
  const { t } = useT();
  const showScope = !pathname.startsWith('/admin');

  return (
    <div className={`shrink-0 ${className}`}>
      {showAppTitle ? (
        <Link
          href="/"
          onClick={onTitleClick}
          className="group flex min-w-0 items-center gap-3"
        >
          <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-sm font-black text-white shadow-md">
            <span className="relative z-10">TM</span>
            <span className="absolute -bottom-3 -end-3 h-7 w-7 rounded-full bg-accent" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold tracking-tight text-foreground/95 transition-colors group-hover:text-accent">
              {t('nav.appTitle')}
            </span>
            <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">Boutique Operations</span>
          </span>
        </Link>
      ) : null}
      {showScope ? (
        <div className={`min-w-0 rounded-2xl border border-border/60 bg-surface px-3 py-2.5 shadow-sm ${showAppTitle ? 'mt-4' : ''}`}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{t('common.workingOnBoutique')}</p>
          {role === 'SUPER_ADMIN' ? (
            <SuperAdminBoutiqueContextPicker />
          ) : (
            <OperationalBoutiqueSelector role={role} />
          )}
        </div>
      ) : null}
    </div>
  );
}
