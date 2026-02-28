import { ReactNode } from 'react';

export function OpsCard({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 ${className}`}
    >
      {title ? (
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      ) : null}
      {children}
    </div>
  );
}
