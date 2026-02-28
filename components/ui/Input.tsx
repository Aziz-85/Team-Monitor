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
          className="mb-1 block text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--muted)' }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={`h-10 w-full min-w-0 rounded-lg border px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 ${className}`}
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
        {...props}
      />
      {error != null && error !== '' && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
