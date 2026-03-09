'use client';

export function DatePicker({
  value,
  onChange,
  id,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}) {
  return (
    <input
      type="date"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-border px-3 py-2 text-base text-foreground ${className}`}
    />
  );
}
