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
    <div className={`min-w-0 overflow-hidden ${className}`}>
      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`max-w-0 py-3 px-3 text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
