'use client';

import { ReactNode } from 'react';

export function SnapshotCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </h3>
      {children}
    </div>
  );
}
