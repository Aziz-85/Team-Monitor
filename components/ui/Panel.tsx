'use client';

import type { ReactNode } from 'react';
import { surfacePanel } from '@/lib/ui-styles';

export type PanelProps = {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function Panel({ title, children, actions, className = '' }: PanelProps) {
  return (
    <div className={`${surfacePanel} shadow-sm p-5 ${className}`.trim()}>
      {(title != null || actions != null) && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {title != null && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {actions != null && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          <div className="mt-3 border-t border-border pt-4" />
        </>
      )}
      <div className={title != null || actions != null ? '' : ''}>{children}</div>
    </div>
  );
}
