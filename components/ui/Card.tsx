'use client';

import type { ReactNode } from 'react';
import { cardPadding, surfacePanel } from '@/lib/ui-styles';

export type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`app-card app-card-generic ${surfacePanel} shadow-sm ${cardPadding} ${className}`.trim()}>
      {children}
    </div>
  );
}
