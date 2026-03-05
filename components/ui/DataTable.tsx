'use client';

/**
 * Unified DataTable — single source for table composition (admin, luxury variants).
 * Use AdminDataTable or LuxuryTable for backward compatibility; prefer DataTable with variant for new code.
 */

import React, { forwardRef, ReactNode } from 'react';

export type DataTableVariant = 'admin' | 'luxury';

export type DataTableProps = {
  children: ReactNode;
  className?: string;
  variant?: DataTableVariant;
  /** When true (luxury only), no horizontal scroll; table fits container. */
  noScroll?: boolean;
};

export function DataTable({
  children,
  className = '',
  variant = 'luxury',
  noScroll = false,
}: DataTableProps) {
  const isAdmin = variant === 'admin';
  const tableEl = (
    <table
      className={`w-full border-collapse text-sm ${
        noScroll || isAdmin ? 'min-w-0 table-fixed' : 'min-w-[600px]'
      }`}
    >
      {children}
    </table>
  );
  if (isAdmin) {
    return (
      <div
        className={`max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
      >
        <div className="overflow-x-auto overflow-y-visible" style={{ overflowX: 'hidden' }}>
          {tableEl}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`w-full rounded-xl border border-slate-200 bg-white ${
        noScroll ? 'overflow-hidden' : 'overflow-x-auto'
      } ${className}`}
    >
      {tableEl}
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50 text-start text-slate-700">
        {children}
      </tr>
    </thead>
  );
}

export const DataTableTh = forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { truncate?: boolean }
>(function DataTableTh({ children, className = '', truncate = false, ...props }, ref) {
  return (
    <th
      ref={ref}
      className={`border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 md:text-sm ${className}`}
      {...props}
    >
      {truncate ? (
        <span className="block truncate" title={typeof children === 'string' ? children : undefined}>
          {children}
        </span>
      ) : (
        children
      )}
    </th>
  );
});

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody className="bg-white">{children}</tbody>;
}

export function DataTableTd({
  children,
  className = '',
  title,
  truncate = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { truncate?: boolean }) {
  const t = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <td className={`border-b border-slate-200 px-3 py-2 text-sm ${className}`} {...props}>
      {truncate ? (
        <span className="block min-w-0 truncate" title={t}>
          {children}
        </span>
      ) : (
        children
      )}
    </td>
  );
}
