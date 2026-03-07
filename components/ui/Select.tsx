'use client';

import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';

export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label?: string;
  error?: string;
  options: SelectOption[];
  className?: string;
};

export function Select({
  label,
  error,
  options,
  className = '',
  id: idProp,
  ...props
}: SelectProps) {
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
      <select
        id={id}
        className={`h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0 disabled:opacity-50 ${className}`}
        {...props}
      >
        {options.map(({ value, label: optLabel }) => (
          <option key={value} value={value}>
            {optLabel}
          </option>
        ))}
      </select>
      {error != null && error !== '' && (
        <p className="mt-1 text-xs text-luxury-error">{error}</p>
      )}
    </div>
  );
}
