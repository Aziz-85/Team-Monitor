'use client';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Consistent chart card wrapper: rounded corners, soft shadow, strong title hierarchy.
 * Use for all chart containers across the site.
 */
export function ChartCard({ title, subtitle, children, className = '' }: Props) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
