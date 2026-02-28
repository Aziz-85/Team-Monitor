'use client';

import type { ReactNode } from 'react';

export type TableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

export type TableProps = {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  className?: string;
};

export function Table({ columns, data, className = '' }: TableProps) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        borderStyle: 'solid',
      }}
    >
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-0 table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-2 text-[11px] font-medium uppercase tracking-wide ps-3 pe-3 ${
                    col.align === 'right' ? 'text-end' : 'text-start'
                  }`}
                  style={{ color: 'var(--muted)' }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                style={{ borderColor: 'var(--border)' }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-2 ps-3 pe-3 ${col.align === 'right' ? 'text-end tabular-nums' : 'text-start'}`}
                    style={{ color: 'var(--text)' }}
                  >
                    {row[col.key] != null ? String(row[col.key]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TableContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        borderStyle: 'solid',
      }}
    >
      <div className="min-w-0 overflow-x-auto">{children}</div>
    </div>
  );
}
