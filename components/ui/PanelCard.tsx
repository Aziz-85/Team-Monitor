'use client';

import type { ReactNode } from 'react';

export type PanelCardProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function PanelCard({ title, children, actions }: PanelCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {actions != null && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-3 border-t border-slate-200 pt-4">{children}</div>
    </div>
  );
}
