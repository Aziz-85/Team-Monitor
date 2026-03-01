'use client';

import type { ReactNode } from 'react';

/**
 * Executive panel — Premium container for executive/analytics content.
 * Uses luxury theme (soft shadow, 12px radius, clear hierarchy).
 */
export type ExecutivePanelProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ExecutivePanel({ title, subtitle, children, actions, className = '' }: ExecutivePanelProps) {
  return (
    <div
      className={`rounded-card p-5 shadow-card ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {(title != null || actions != null) && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {title != null && (
              <h2 className="text-lg font-medium" style={{ color: 'var(--primary)' }}>
                {title}
              </h2>
            )}
            {subtitle != null && subtitle !== '' && (
              <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={title != null || actions != null ? 'mt-4' : ''}>{children}</div>
    </div>
  );
}
