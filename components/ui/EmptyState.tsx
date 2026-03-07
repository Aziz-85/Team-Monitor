'use client';

import type { ReactNode } from 'react';

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/**
 * Shared empty state for lists, tables, and report sections.
 * Token-based styling (text-foreground, text-muted).
 */
export function EmptyState({ title, description, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 py-8 px-4 text-center ${className}`}
    >
      {icon != null && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description != null && description !== '' && (
        <p className="text-sm text-muted max-w-sm">{description}</p>
      )}
      {action != null && <div className="mt-2">{action}</div>}
    </div>
  );
}
