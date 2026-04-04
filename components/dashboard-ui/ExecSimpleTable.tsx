'use client';

import type { ReactNode } from 'react';

export type ExecSimpleTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

export type ExecSimpleTableProps = {
  columns: ExecSimpleTableColumn[];
  children: ReactNode;
  className?: string;
};

export function ExecSimpleTable({
  columns,
  children,
  className = '',
}: ExecSimpleTableProps) {
  return (
    <div className={`min-w-0 overflow-x-auto ${className}`}>
      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle align-middle">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`max-w-0 truncate whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-muted-foreground md:text-sm ${
                  col.align === 'right' ? 'text-end' : 'text-start'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="data-table-tbody">{children}</tbody>
      </table>
    </div>
  );
}
