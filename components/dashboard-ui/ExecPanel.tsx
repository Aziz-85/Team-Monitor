'use client';

import type { ReactNode } from 'react';

export type ExecPanelProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ExecPanel({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: ExecPanelProps) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm ${className}`}
    >
      {(title != null || actions != null) && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              {title != null && (
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
              )}
              {subtitle != null && subtitle !== '' && (
                <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
              )}
            </div>
            {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
          <div className="mt-3 border-b border-border" />
        </>
      )}
      <div className={title != null || actions != null ? 'pt-4' : ''}>{children}</div>
    </div>
  );
}
