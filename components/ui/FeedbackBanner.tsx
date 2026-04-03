'use client';

import { alertDanger, alertSuccess, alertWarning } from '@/lib/ui-styles';

export type FeedbackBannerVariant = 'error' | 'success' | 'warning';

export type FeedbackBannerProps = {
  variant: FeedbackBannerVariant;
  message: string;
  className?: string;
  onDismiss?: () => void;
};

const variantClass: Record<FeedbackBannerVariant, string> = {
  error: alertDanger,
  success: alertSuccess,
  warning: alertWarning,
};

/**
 * Inline success / warning / error feedback (replaces alert() for non-blocking notices).
 */
export function FeedbackBanner({ variant, message, className = '', onDismiss }: FeedbackBannerProps) {
  return (
    <div
      className={`flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm ${variantClass[variant]} ${className}`.trim()}
      role="alert"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <span className="min-w-0">{message}</span>
      {onDismiss != null ? (
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium underline opacity-90 hover:opacity-100"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
