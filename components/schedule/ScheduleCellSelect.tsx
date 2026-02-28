'use client';

import { SCHEDULE_UI } from '@/lib/scheduleUi';

type Option = { value: string; label: string };

type ScheduleCellSelectProps = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
  /** Use true inside schedule table cells for compact row fit */
  compact?: boolean;
};

/**
 * Single select for schedule. Use compact=true inside table cells (selectCompact); default for other forms.
 */
export function ScheduleCellSelect({
  value,
  options,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
  className = '',
  compact = false,
}: ScheduleCellSelectProps) {
  const selectClass = compact ? SCHEDULE_UI.selectCompact : SCHEDULE_UI.select;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${selectClass} ${className}`.trim()}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
