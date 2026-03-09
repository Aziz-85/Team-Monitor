'use client';

import type { ReactNode } from 'react';

export type PanelCardProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function PanelCard({ title, children, actions }: PanelCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {actions != null && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-3 border-t border-border pt-4">{children}</div>
    </div>
  );
}
