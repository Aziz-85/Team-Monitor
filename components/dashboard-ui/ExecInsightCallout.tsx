'use client';

export type ExecInsightCalloutProps = {
  title?: string;
  items: {
    label: string;
    value: string;
  }[];
  className?: string;
};

export function ExecInsightCallout({
  title = 'Insights',
  items,
  className = '',
}: ExecInsightCalloutProps) {
  return (
    <div
      className={`min-w-0 rounded-lg border border-border bg-surface-subtle/50 p-3 ${className}`}
    >
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {title}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-foreground">
            <span className="font-medium text-muted">{item.label}:</span>{' '}
            {item.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
