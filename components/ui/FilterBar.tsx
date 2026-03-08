'use client';

import type { ReactNode } from 'react';

export type FilterChip = { label: string; value: string };

export type QuickPeriod = { id: string; label: string };

export type FilterBarProps = {
  children: ReactNode;
  /** Optional active filters to show as chips (e.g. "Boutique: AlRashid", "From–To: 2025-01-01 – 2025-01-31") */
  activeFilters?: FilterChip[];
  onClearFilter?: (label: string) => void;
  onClearAll?: () => void;
  /** Quick period chips (e.g. Week, Month, Quarter, Custom); selecting one calls onPeriodSelect(id) */
  quickPeriods?: readonly QuickPeriod[];
  /** Currently selected quick period id (for chip highlight); use "custom" when dates are manual */
  selectedPeriodId?: string;
  onPeriodSelect?: (id: string) => void;
  /** Single summary line above controls, e.g. "Viewing AlRashid • Jan 1 → Mar 7" */
  summaryLine?: ReactNode;
  /** When set, a Reset button is shown; callback should restore default filters */
  onReset?: () => void;
  className?: string;
};

/**
 * Wrapper for report filter controls. Stripe/Linear-style: surface, border, padding.
 * Optional: summary line, quick period chips, Reset, and active filter chips.
 */
export function FilterBar({
  children,
  activeFilters = [],
  onClearFilter,
  onClearAll,
  quickPeriods = [],
  selectedPeriodId,
  onPeriodSelect,
  summaryLine,
  onReset,
  className = '',
}: FilterBarProps) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-4 shadow-sm ${className}`}>
      {summaryLine != null && (
        <p className="mb-3 text-sm text-muted">{summaryLine}</p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {quickPeriods.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {quickPeriods.map(({ id, label }) => {
              const selected = selectedPeriodId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPeriodSelect?.(id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-accent bg-surface-subtle text-foreground'
                      : 'border-border bg-surface text-muted hover:bg-surface-subtle hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {children}
        {onReset != null && (
          <button
            type="button"
            onClick={onReset}
            className="text-sm text-muted hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted">Active:</span>
          {activeFilters.map(({ label, value }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs text-foreground"
            >
              <span className="text-muted">{label}:</span>
              <span>{value}</span>
              {onClearFilter && (
                <button
                  type="button"
                  onClick={() => onClearFilter(label)}
                  className="rounded p-0.5 hover:bg-border/50"
                  aria-label={`Clear ${label}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {onClearAll && activeFilters.length > 1 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-muted hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
