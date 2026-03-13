'use client';

/**
 * Canonical CardShell — single source of truth for card wrappers.
 * Use this for all card shells; do not import from ui/CardShell (removed).
 *
 * Variants:
 * - dashboard: SnapshotCard family (rounded-lg, p-5)
 * - luxury: Premium cards with hover (rounded-2xl, p-6)
 * - home: Home page cards — matches luxury but transition-shadow only (no border hover)
 */

import { ReactNode } from 'react';

export type CardShellVariant = 'dashboard' | 'luxury' | 'home';

type CardShellProps = {
  variant?: CardShellVariant;
  children: ReactNode;
  className?: string;
};

const VARIANT_STYLES: Record<CardShellVariant, string> = {
  dashboard: 'rounded-lg border border-border bg-surface p-5 shadow-card',
  luxury: 'rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80',
  home: 'rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md',
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
