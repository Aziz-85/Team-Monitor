'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors h-10 px-4 text-sm min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent',
  secondary:
    'border border-border bg-surface text-foreground hover:bg-surface-subtle focus-visible:ring-border',
  ghost:
    'bg-transparent text-foreground hover:bg-surface-subtle focus-visible:ring-border',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

export function Button({
  variant = 'primary',
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
