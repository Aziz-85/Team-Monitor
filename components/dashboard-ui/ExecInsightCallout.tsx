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
      className={`min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-3 ${className}`}
    >
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {title}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-slate-900">
            <span className="font-medium text-slate-600">{item.label}:</span>{' '}
            {item.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
