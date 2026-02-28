'use client';

import type { ReactNode } from 'react';

export type ExecCardProps = {
  children: ReactNode;
  className?: string;
};

export function ExecCard({ children, className = '' }: ExecCardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
