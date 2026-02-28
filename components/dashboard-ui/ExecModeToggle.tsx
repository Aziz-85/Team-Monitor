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
      className="flex min-w-0 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onChange('Operator')}
        className={`min-w-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          value === 'Operator'
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        Operator
      </button>
      <button
        type="button"
        onClick={() => onChange('Investor')}
        className={`min-w-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          value === 'Investor'
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        Investor
      </button>
    </div>
  );
}
