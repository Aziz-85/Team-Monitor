'use client';

import type { ReactNode } from 'react';

export type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-xl shadow-sm p-4 md:p-5 ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        borderStyle: 'solid',
      }}
    >
      {children}
    </div>
  );
}
