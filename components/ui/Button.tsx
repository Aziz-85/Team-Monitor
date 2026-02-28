'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
};

export function Button({
  variant = 'primary',
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors h-10 px-4 text-sm min-w-0';
  const primary =
    'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const secondary =
    'border bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const styles =
    variant === 'primary'
      ? primary
      : secondary;

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
      style={
        variant === 'primary'
          ? { backgroundColor: 'var(--accent)' }
          : { borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }
      }
      {...props}
    >
      {children}
    </button>
  );
}
