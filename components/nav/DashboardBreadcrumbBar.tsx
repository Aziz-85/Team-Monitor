'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getDashboardBreadcrumbTrail } from '@/lib/nav/dashboardBreadcrumbs';

/**
 * Global breadcrumb trail + back control. Labels are i18n keys only (no URL segments in visible text).
 */
export function DashboardBreadcrumbBar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { t, isRtl } = useT();

  const trail = getDashboardBreadcrumbTrail(pathname);
  if (!trail) return null;

  const { crumbs, backHref, showBack } = trail;

  if (pathname === '/' && crumbs.length === 1) {
    return null;
  }

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    if (backHref) router.push(backHref);
    else router.push('/');
  };

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-2 border-b border-border/60 bg-surface-subtle/50 px-3 py-2 text-sm md:px-4 ${isRtl ? 'flex-row-reverse' : ''}`}
    >
      {showBack ? (
        <button
          type="button"
          onClick={handleBack}
          className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {isRtl ? `${t('common.back')} →` : `← ${t('common.back')}`}
        </button>
      ) : null}
      <nav aria-label={t('nav.breadcrumb.ariaLabel')} className="min-w-0 flex-1">
        <ol className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted ${isRtl ? 'flex-row-reverse' : ''}`}>
          {crumbs.map((c, idx) => (
            <li key={`${c.labelKey}-${idx}`} className="flex min-w-0 items-center gap-1.5">
              {idx > 0 ? (
                <span className="text-border select-none" aria-hidden>
                  /
                </span>
              ) : null}
              {c.href != null && idx < crumbs.length - 1 ? (
                <Link href={c.href} className="truncate hover:text-foreground">
                  {t(c.labelKey)}
                </Link>
              ) : (
                <span className={idx === crumbs.length - 1 ? 'truncate font-medium text-foreground/90' : 'truncate'}>
                  {t(c.labelKey)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
