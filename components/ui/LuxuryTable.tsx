'use client';

/**
 * Luxury table: optional noScroll for schedule/edit. Uses unified DataTable.
 * @see components/ui/DataTable.tsx
 */

import React, { forwardRef, ReactNode } from 'react';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';

export function LuxuryTable({
  children,
  className = '',
  noScroll,
}: {
  children: ReactNode;
  className?: string;
  /** When true, no horizontal scroll; table fits container (e.g. schedule edit page). */
  noScroll?: boolean;
}) {
  return (
    <DataTable variant="luxury" noScroll={noScroll} className={className}>
      {children}
    </DataTable>
  );
}

export function LuxuryTableHead({ children }: { children: ReactNode }) {
  return <DataTableHead>{children}</DataTableHead>;
}

export const LuxuryTh = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  function LuxuryTh({ children, className = '', ...props }, ref) {
    return (
      <DataTableTh ref={ref} className={className} {...props}>
        {children}
      </DataTableTh>
    );
  }
);

export function LuxuryTableBody({ children }: { children: ReactNode }) {
  return <DataTableBody>{children}</DataTableBody>;
}

export function LuxuryTd({
  children,
  className = '',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <DataTableTd className={className} {...props}>
      {children}
    </DataTableTd>
  );
}
