'use client';

import type { ReactNode } from 'react';

export type PanelProps = {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function Panel({ title, children, actions, className = '' }: PanelProps) {
  return (
    <div
      className={`rounded-xl shadow-sm p-5 ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        borderStyle: 'solid',
      }}
    >
      {(title != null || actions != null) && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {title != null && (
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                {title}
              </h2>
            )}
            {actions != null && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          <div className="mt-3 border-t pt-4" style={{ borderColor: 'var(--border)' }} />
        </>
      )}
      <div className={title != null || actions != null ? '' : ''}>{children}</div>
    </div>
  );
}
