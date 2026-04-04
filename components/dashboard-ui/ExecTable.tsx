'use client';

export type ExecTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

export type ExecTableProps = {
  columns: ExecTableColumn[];
  data: Record<string, unknown>[];
  className?: string;
};

export function ExecTable({ columns, data, className = '' }: ExecTableProps) {
  return (
    <div className={`min-w-0 overflow-x-auto ${className}`}>
      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle align-middle">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-muted-foreground md:text-sm ${
                  col.align === 'right' ? 'text-end' : 'text-start'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="data-table-tbody">
          {data.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border odd:bg-muted/30 last:border-b-0"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`max-w-0 px-3 py-2.5 align-middle text-sm truncate ${
                    col.align === 'right' ? 'text-end tabular-nums font-medium' : 'text-start'
                  } text-foreground`}
                  title={row[col.key] != null ? String(row[col.key]) : undefined}
                >
                  {row[col.key] != null ? String(row[col.key]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
