'use client';

/**
 * Shared card shell for consistent styling across card families.
 * - dashboard: SnapshotCard, SalesPerformanceCard, ScheduleHealthCard, TaskControlCard
 * - luxury: LuxuryPerformanceCard, LuxuryPaceCard, LuxuryTopSellerCard (future migration)
 */

import { ReactNode } from 'react';

export type CardShellVariant = 'dashboard' | 'luxury';

type CardShellProps = {
  variant?: CardShellVariant;
  children: ReactNode;
  className?: string;
};

const VARIANT_STYLES: Record<CardShellVariant, string> = {
  dashboard: 'rounded-lg border border-border bg-surface p-5 shadow-card',
  luxury: 'rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80',
};

export function CardShell({
  variant = 'dashboard',
  children,
  className = '',
}: CardShellProps) {
  return (
    <div className={`${VARIANT_STYLES[variant]} ${className}`.trim()}>
      {children}
    </div>
  );
}
