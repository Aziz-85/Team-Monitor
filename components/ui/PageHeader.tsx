'use client';

import type { ReactNode } from 'react';

export type PageHeaderProps = {
  /** Optional breadcrumb or context above the title */
  breadcrumb?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

/**
 * Standard page header: optional breadcrumb, title, subtitle, actions.
 * Use for consistent hierarchy across dashboard and report pages.
 */
export function PageHeader({ breadcrumb, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex min-w-0 flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb != null && (
          <div className="mb-1 text-sm text-muted">{breadcrumb}</div>
        )}
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle != null && subtitle !== '' && (
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        )}
      </div>
      {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
