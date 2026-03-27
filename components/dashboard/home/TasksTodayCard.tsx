'use client';

import { ReactNode } from 'react';
import { CardShell } from '../cards/CardShell';

type Props = {
  title: string;
  subtitle?: string | null;
  total: number;
  completed: number;
  pending: number;
  loading: boolean;
  error: string | null;
  emptyLabel: string;
  doneLabel: string;
  children: ReactNode;
};

export function TasksTodayCard({
  title,
  subtitle,
  total,
  completed,
  pending,
  loading,
  error,
  emptyLabel,
  doneLabel,
  children,
}: Props) {
  return (
    <CardShell variant="home">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h3>
      {subtitle && <p className="-mt-3 mb-4 text-xs text-muted">{subtitle}</p>}
      {loading && <p className="text-sm text-muted">…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && total === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-subtle/30 py-12 text-center">
          <span className="mb-3 text-3xl text-muted/70" aria-hidden>✓</span>
          <p className="text-sm font-medium text-muted">{emptyLabel}</p>
        </div>
      )}
      {!loading && !error && total > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-4">
            <div>
              <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
              <span className="ms-1 text-xs text-muted">due</span>
            </div>
            <div>
              <span className="text-2xl font-bold tabular-nums text-emerald-600">{completed}</span>
              <span className="ms-1 text-xs text-muted">{doneLabel}</span>
            </div>
            <div>
              <span className="text-2xl font-bold tabular-nums text-amber-600">{pending}</span>
              <span className="ms-1 text-xs text-muted">pending</span>
            </div>
          </div>
          <ul className="space-y-2">{children}</ul>
        </>
      )}
    </CardShell>
  );
}
