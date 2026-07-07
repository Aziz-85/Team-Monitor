'use client';

import type { ReactNode } from 'react';

type Props = {
  t: (key: string) => string;
  issueCount?: number;
  children: ReactNode;
  footer?: ReactNode;
};

export function EditorTechnicalPanel({ t, issueCount = 0, children, footer }: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  const label = tr('schedule.proposal.advancedPanel', 'Advanced');
  const badge = issueCount > 0 ? ` (${issueCount})` : '';

  return (
    <details className="rounded-xl border border-dashed border-border bg-surface-subtle/40">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-muted hover:text-foreground">
        {label}
        {badge}
      </summary>
      <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
        {children}
        {footer}
      </div>
    </details>
  );
}
