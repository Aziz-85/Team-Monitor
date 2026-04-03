'use client';

import type { ReactNode } from 'react';
import {
  badgeBase,
  badgeDanger,
  badgeNeutral,
  badgeSuccess,
  badgeWarning,
} from '@/lib/ui-styles';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger';

export type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
  neutral: badgeNeutral,
  success: badgeSuccess,
  warning: badgeWarning,
  danger: badgeDanger,
};

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return (
    <span className={`${badgeBase} ${variantStyles[variant]} ${className}`.trim()}>
      {children}
    </span>
  );
}
