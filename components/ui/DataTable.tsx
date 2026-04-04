'use client';

/**
 * Unified DataTable — single source for table composition (admin, luxury variants).
 * Use AdminDataTable or LuxuryTable for backward compatibility; prefer DataTable with variant for new code.
 * Supports sticky header, optional zebra rows, and row hover (via globals .data-table-tbody).
 */

import React, { forwardRef, ReactNode } from 'react';
import { dataTableTd, dataTableTh, dataTableTheadTr, tableWrapper } from '@/lib/ui-styles';

export type DataTableVariant = 'admin' | 'luxury';

export type DataTableProps = {
  children: ReactNode;
  className?: string;
  variant?: DataTableVariant;
  /** When true (luxury only), no horizontal scroll; table fits container. */
  noScroll?: boolean;
  /** Sticky thead when scrolling (default true). */
  stickyHeader?: boolean;
  /** Alternating row background for tbody (default false). */
  zebra?: boolean;
};

export function DataTable({
  children,
  className = '',
  variant = 'luxury',
  noScroll = false,
  stickyHeader = true,
  zebra = false,
}: DataTableProps) {
  const isAdmin = variant === 'admin';
  const wrapperClass = [
    tableWrapper,
    stickyHeader ? 'data-table-sticky' : '',
    zebra ? 'data-table-zebra' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
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
      <div className={`max-w-full ${wrapperClass}`}>
        <div className="overflow-x-auto">{tableEl}</div>
      </div>
    );
  }
  return (
    <div
      className={`w-full ${noScroll ? 'overflow-hidden' : 'overflow-x-auto'} ${wrapperClass}`}
    >
      {tableEl}
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className={dataTableTheadTr}>{children}</tr>
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
      className={`${dataTableTh} ${className}`}
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
  return <tbody className="data-table-tbody bg-surface">{children}</tbody>;
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
    <td className={`${dataTableTd} ${className}`} {...props}>
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
