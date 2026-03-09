'use client';

export type ExecViewMode = 'Operator' | 'Investor';

export type ExecModeToggleProps = {
  value: ExecViewMode;
  onChange: (mode: ExecViewMode) => void;
  'aria-label'?: string;
};

export function ExecModeToggle({
  value,
  onChange,
  'aria-label': ariaLabel = 'View mode',
}: ExecModeToggleProps) {
  return (
    <div
      className="flex min-w-0 rounded-lg border border-border bg-surface p-0.5 shadow-sm"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onChange('Operator')}
        className={`min-w-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          value === 'Operator'
            ? 'bg-surface-subtle text-foreground'
            : 'text-muted hover:bg-surface-subtle'
        }`}
      >
        Operator
      </button>
      <button
        type="button"
        onClick={() => onChange('Investor')}
        className={`min-w-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          value === 'Investor'
            ? 'bg-surface-subtle text-foreground'
            : 'text-muted hover:bg-surface-subtle'
        }`}
      >
        Investor
      </button>
    </div>
  );
}
