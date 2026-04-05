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
          className="block min-w-0 truncate text-lg font-semibold text-foreground/90 hover:text-foreground"
        >
          {t('nav.appTitle')}
        </Link>
      ) : null}
      {showScope ? (
        <div className={`min-w-0 rounded-xl bg-surface-subtle/70 px-2.5 py-2 ${showAppTitle ? 'mt-3' : ''}`}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{t('common.workingOnBoutique')}:</p>
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
