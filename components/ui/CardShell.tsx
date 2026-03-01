'use client';

import type { ReactNode } from 'react';

/**
 * Card shell — Light Corporate Luxury: 12px radius, soft shadow, spacious padding.
 * Use for data hierarchy and consistent card layout.
 */
export type CardShellProps = {
  children: ReactNode;
  className?: string;
};

export function CardShell({ children, className = '' }: CardShellProps) {
  return (
    <div
      className={`rounded-card p-5 shadow-card ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {children}
    </div>
  );
}
