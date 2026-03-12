'use client';

import { ReactNode } from 'react';

type Props = {
  title: string;
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
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h3>
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
          <div className="mb-4 flex gap-4">
            <div>
              <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
              <span className="ml-1 text-xs text-muted">due</span>
            </div>
            <div>
              <span className="text-2xl font-bold tabular-nums text-emerald-600">{completed}</span>
              <span className="ml-1 text-xs text-muted">{doneLabel}</span>
            </div>
            <div>
              <span className="text-2xl font-bold tabular-nums text-amber-600">{pending}</span>
              <span className="ml-1 text-xs text-muted">pending</span>
            </div>
          </div>
          <ul className="space-y-2">{children}</ul>
        </>
      )}
    </div>
  );
}
