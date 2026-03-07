'use client';

/**
 * Admin table: truncate long text, no horizontal scroll. Uses unified DataTable.
 * @see components/ui/DataTable.tsx
 */

import { ReactNode } from 'react';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';

export function AdminDataTable({
  children,
  className = '',
  stickyHeader = true,
  zebra = false,
}: {
  children: ReactNode;
  className?: string;
  stickyHeader?: boolean;
  zebra?: boolean;
}) {
  return (
    <DataTable variant="admin" className={className} stickyHeader={stickyHeader} zebra={zebra}>
      {children}
    </DataTable>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return <DataTableHead>{children}</DataTableHead>;
}

export function AdminTh({
  children,
  className = '',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <DataTableTh truncate className={className} {...props}>
      {children}
    </DataTableTh>
  );
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return <DataTableBody>{children}</DataTableBody>;
}

export function AdminTd({
  children,
  className = '',
  title,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <DataTableTd truncate title={title} className={className} {...props}>
      {children}
    </DataTableTd>
  );
}
