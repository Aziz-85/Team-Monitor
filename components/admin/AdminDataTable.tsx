'use client';

import { ReactNode } from 'react';

/**
 * Table wrapper: no horizontal scroll, truncate long text. Light theme.
 */
export function AdminDataTable({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="overflow-x-auto overflow-y-visible" style={{ overflowX: 'hidden' }}>
        <table className="w-full table-fixed border-collapse text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
        {children}
      </tr>
    </thead>
  );
}

export function AdminTh({
  children,
  className = '',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 md:text-sm ${className}`}
      {...props}
    >
      <span className="block truncate" title={typeof children === 'string' ? children : undefined}>
        {children}
      </span>
    </th>
  );
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return <tbody className="bg-white">{children}</tbody>;
}

export function AdminTd({
  children,
  className = '',
  title,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const t = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <td className={`border-b border-slate-200 px-3 py-2 text-sm ${className}`} {...props}>
      <span className="block min-w-0 truncate" title={t}>
        {children}
      </span>
    </td>
  );
}
