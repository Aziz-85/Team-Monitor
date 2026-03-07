'use client';

import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  className?: string;
};

export function Input({
  label,
  error,
  className = '',
  id: idProp,
  ...props
}: InputProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  return (
    <div className="min-w-0">
      {label != null && (
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={`h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0 disabled:opacity-50 ${className}`}
        {...props}
      />
      {error != null && error !== '' && (
        <p className="mt-1 text-xs text-luxury-error">{error}</p>
      )}
    </div>
  );
}
